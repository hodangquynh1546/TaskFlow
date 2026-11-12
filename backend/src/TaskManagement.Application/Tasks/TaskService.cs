using FluentValidation;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Application.Abstractions;
using TaskManagement.Application.Common;
using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;

namespace TaskManagement.Application.Tasks;

public interface ITaskService
{
    Task<PagedResult<TaskDto>> ListAsync(TaskQuery query, CancellationToken cancellationToken);

    Task<TaskDto> GetAsync(Guid id, CancellationToken cancellationToken);

    Task<TaskDto> CreateAsync(CreateTaskRequest request, CancellationToken cancellationToken);

    Task<TaskDto> UpdateAsync(Guid id, UpdateTaskRequest request, CancellationToken cancellationToken);

    Task<TaskDto> ChangeStatusAsync(Guid id, ChangeStatusRequest request, CancellationToken cancellationToken);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken);
}

internal sealed class TaskService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<CreateTaskRequest> createValidator,
    IValidator<UpdateTaskRequest> updateValidator,
    IValidator<ChangeStatusRequest> statusValidator,
    IValidator<TaskQuery> queryValidator) : ITaskService
{
    public async Task<PagedResult<TaskDto>> ListAsync(TaskQuery query, CancellationToken cancellationToken)
    {
        await queryValidator.ValidateAndThrowAsync(query, cancellationToken);

        var now = clock.GetUtcNow();
        var filtered = ApplyFilters(OwnTasks().AsNoTracking(), query, now);

        var total = await filtered.CountAsync(cancellationToken);
        if (total == 0)
        {
            return new PagedResult<TaskDto>([], query.Page, query.PageSize, 0);
        }

        var tasks = await ApplySort(filtered, query)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<TaskDto>(tasks.ConvertAll(t => TaskDto.From(t, now)), query.Page, query.PageSize, total);
    }

    public async Task<TaskDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var task = await OwnTasks().AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
            ?? throw NotFound();
        return TaskDto.From(task, clock.GetUtcNow());
    }

    public async Task<TaskDto> CreateAsync(CreateTaskRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var now = clock.GetUtcNow();
        // The owner always comes from the token (BR-01); there is no UserId on the request to trust.
        var task = TaskItem.Create(currentUser.UserId, request.Title, request.Description, request.Priority, request.Status, request.StartDate, request.DueDate, now, request.DurationMinutes);
        db.Tasks.Add(task);
        await db.SaveChangesAsync(cancellationToken);
        return TaskDto.From(task, now);
    }

    public async Task<TaskDto> UpdateAsync(Guid id, UpdateTaskRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var task = await OwnTasks().FirstOrDefaultAsync(t => t.Id == id, cancellationToken) ?? throw NotFound();
        var now = clock.GetUtcNow();
        task.Update(request.Title, request.Description, request.Priority!.Value, request.Status!.Value, request.StartDate, request.DueDate, now, request.DurationMinutes);
        await db.SaveChangesAsync(cancellationToken);
        return TaskDto.From(task, now);
    }

    public async Task<TaskDto> ChangeStatusAsync(Guid id, ChangeStatusRequest request, CancellationToken cancellationToken)
    {
        await statusValidator.ValidateAndThrowAsync(request, cancellationToken);

        var task = await OwnTasks().FirstOrDefaultAsync(t => t.Id == id, cancellationToken) ?? throw NotFound();
        var now = clock.GetUtcNow();
        task.ChangeStatus(request.Status!.Value, now);
        await db.SaveChangesAsync(cancellationToken);
        return TaskDto.From(task, now);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var task = await OwnTasks().FirstOrDefaultAsync(t => t.Id == id, cancellationToken) ?? throw NotFound();
        db.Tasks.Remove(task);
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// The only door to task data. Ownership is part of every query (BR-10), so another user's task is
    /// indistinguishable from a missing one and there is no read-then-check gap.
    /// </summary>
    private IQueryable<TaskItem> OwnTasks()
    {
        var userId = currentUser.UserId;
        return db.Tasks.Where(t => t.UserId == userId);
    }

    private static IQueryable<TaskItem> ApplyFilters(IQueryable<TaskItem> tasks, TaskQuery query, DateTimeOffset now)
    {
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Contains() is translated to a literal substring match, so '%' and '_' carry no wildcard meaning (SF-01).
            var term = query.Search.Trim().ToLowerInvariant();
            // EF Core/Npgsql only translate the parameterless ToLower() and the plain Contains(string); the analyzers'
            // preferred alternatives (culture/StringComparison overloads) fail to translate. This becomes lower(...) + strpos(...).
#pragma warning disable CA1304, CA1311, CA1862
            tasks = tasks.Where(t => t.Title.ToLower().Contains(term));
#pragma warning restore CA1304, CA1311, CA1862
        }
        if (query.Status is { } status)
        {
            tasks = tasks.Where(t => t.Status == status);
        }
        if (query.Priority is { } priority)
        {
            tasks = tasks.Where(t => t.Priority == priority);
        }
        // Npgsql refuses timestamptz parameters with a non-zero offset, so range bounds are normalised to UTC.
        if (query.DueFrom?.ToUniversalTime() is { } from)
        {
            tasks = tasks.Where(t => t.DueDate >= from);
        }
        if (query.DueTo?.ToUniversalTime() is { } to)
        {
            tasks = tasks.Where(t => t.DueDate <= to);
        }
        if (query.StartFrom?.ToUniversalTime() is { } startFrom)
        {
            tasks = tasks.Where(t => t.StartDate >= startFrom);
        }
        if (query.StartTo?.ToUniversalTime() is { } startTo)
        {
            tasks = tasks.Where(t => t.StartDate <= startTo);
        }
        if (query.Overdue == true)
        {
            tasks = tasks.Where(t => t.DueDate < now && t.Status != TaskItemStatus.Completed);
        }
        return tasks;
    }

    /// <summary>Id is always the last key so pages are stable even when many rows share the sort value (SF-05).</summary>
    private static IOrderedQueryable<TaskItem> ApplySort(IQueryable<TaskItem> tasks, TaskQuery query)
    {
        var desc = query.SortDir == SortDirection.Desc;
        var ordered = (query.SortBy, desc) switch
        {
            (TaskSortField.DueDate, false) => tasks.OrderBy(t => t.DueDate == null).ThenBy(t => t.DueDate),
            (TaskSortField.DueDate, true) => tasks.OrderBy(t => t.DueDate == null).ThenByDescending(t => t.DueDate),
            (TaskSortField.StartDate, false) => tasks.OrderBy(t => t.StartDate == null).ThenBy(t => t.StartDate),
            (TaskSortField.StartDate, true) => tasks.OrderBy(t => t.StartDate == null).ThenByDescending(t => t.StartDate),
            (TaskSortField.Priority, false) => tasks.OrderBy(t => t.Priority).ThenByDescending(t => t.CreatedAt),
            (TaskSortField.Priority, true) => tasks.OrderByDescending(t => t.Priority).ThenByDescending(t => t.CreatedAt),
            (_, false) => tasks.OrderBy(t => t.CreatedAt),
            _ => tasks.OrderByDescending(t => t.CreatedAt),
        };
        return ordered.ThenBy(t => t.Id);
    }

    private static NotFoundException NotFound() => new("Không tìm thấy công việc.");
}
