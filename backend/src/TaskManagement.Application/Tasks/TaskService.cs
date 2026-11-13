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

    /// <summary>Where a task sits in the list for this filter and sort, so the client can open the page that holds it.</summary>
    Task<TaskPositionDto> GetPositionAsync(Guid id, TaskQuery query, CancellationToken cancellationToken);

    /// <summary>Titles the user has used before that start with the typed text, most used first, for the title box to offer.</summary>
    Task<IReadOnlyList<string>> SuggestTitlesAsync(TitleSuggestionsQuery query, CancellationToken cancellationToken);

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
    IValidator<TaskQuery> queryValidator,
    IValidator<TitleSuggestionsQuery> suggestionsValidator) : ITaskService
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

    public async Task<IReadOnlyList<string>> SuggestTitlesAsync(TitleSuggestionsQuery query, CancellationToken cancellationToken)
    {
        await suggestionsValidator.ValidateAndThrowAsync(query, cancellationToken);

        var term = (query.Prefix ?? string.Empty).Trim().ToLowerInvariant();
        if (term.Length == 0)
        {
            return [];
        }

        // As in ApplyFilters, only the parameterless ToLower() and the plain StartsWith(string) translate. StartsWith becomes a
        // LIKE with the text escaped, so '%' and '_' typed by the user match themselves.
#pragma warning disable CA1304, CA1311, CA1862
        var used = await OwnTasks().AsNoTracking()
            .Where(t => t.Title.ToLower().StartsWith(term))
            .GroupBy(t => t.Title)
            .Select(g => new { Title = g.Key, Uses = g.Count(), Last = g.Max(t => t.CreatedAt) })
            .OrderByDescending(x => x.Uses).ThenByDescending(x => x.Last).ThenBy(x => x.Title)
            .Take(TitleSuggestionsQuery.MaxLimit * 3)
            .ToListAsync(cancellationToken);
#pragma warning restore CA1304, CA1311, CA1862

        // "Đã dạy" and "đã dạy" are one suggestion: the more used spelling wins.
        return used.GroupBy(x => x.Title, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First().Title)
            .Take(query.Limit)
            .ToList();
    }

    public async Task<TaskPositionDto> GetPositionAsync(Guid id, TaskQuery query, CancellationToken cancellationToken)
    {
        await queryValidator.ValidateAndThrowAsync(query, cancellationToken);

        // Only ids are read, which keeps this cheap for one person's tasks; the order is exactly the list's order.
        var ids = await ApplySort(ApplyFilters(OwnTasks().AsNoTracking(), query, clock.GetUtcNow()), query)
            .Select(t => t.Id)
            .ToListAsync(cancellationToken);

        var index = ids.IndexOf(id);
        // Missing, someone else's, or hidden by the filters: all the same answer (BR-10).
        return index < 0 ? throw NotFound() : new TaskPositionDto(index / query.PageSize + 1, index);
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
        var task = TaskItem.Create(currentUser.UserId, request.Title, request.Description, request.Priority, request.Status, request.StartDate, TaskSchedule.DueFor(request.StartDate, request.DurationMinutes, request.DueDate), now, request.DurationMinutes);
        db.Tasks.Add(task);
        await db.SaveChangesAsync(cancellationToken);
        return TaskDto.From(task, now);
    }

    public async Task<TaskDto> UpdateAsync(Guid id, UpdateTaskRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var task = await OwnTasks().FirstOrDefaultAsync(t => t.Id == id, cancellationToken) ?? throw NotFound();
        var now = clock.GetUtcNow();
        task.Update(request.Title, request.Description, request.Priority!.Value, request.Status!.Value, request.StartDate, TaskSchedule.DueFor(request.StartDate, request.DurationMinutes, request.DueDate), now, request.DurationMinutes);
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

    /// <summary>
    /// Finished tasks always sink below the open ones, whatever the sort, so finishing a task moves it out of the way.
    /// Id is always the last key so pages are stable even when many rows share the sort value (SF-05).
    /// </summary>
    private static IOrderedQueryable<TaskItem> ApplySort(IQueryable<TaskItem> tasks, TaskQuery query)
    {
        var desc = query.SortDir == SortDirection.Desc;
        var open = tasks.OrderBy(t => t.Status == TaskItemStatus.Completed);
        var ordered = (query.SortBy, desc) switch
        {
            (TaskSortField.DueDate, false) => open.ThenBy(t => t.DueDate == null).ThenBy(t => t.DueDate),
            (TaskSortField.DueDate, true) => open.ThenBy(t => t.DueDate == null).ThenByDescending(t => t.DueDate),
            (TaskSortField.StartDate, false) => open.ThenBy(t => t.StartDate == null).ThenBy(t => t.StartDate).ThenBy(t => t.DueDate == null).ThenBy(t => t.DueDate),
            (TaskSortField.StartDate, true) => open.ThenBy(t => t.StartDate == null).ThenByDescending(t => t.StartDate).ThenBy(t => t.DueDate == null).ThenByDescending(t => t.DueDate),
            (TaskSortField.Priority, false) => open.ThenBy(t => t.Priority).ThenByDescending(t => t.CreatedAt),
            (TaskSortField.Priority, true) => open.ThenByDescending(t => t.Priority).ThenByDescending(t => t.CreatedAt),
            (_, false) => open.ThenBy(t => t.CreatedAt),
            _ => open.ThenByDescending(t => t.CreatedAt),
        };
        return ordered.ThenBy(t => t.Id);
    }

    private static NotFoundException NotFound() => new("Không tìm thấy công việc.");
}
