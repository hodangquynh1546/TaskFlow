using FluentValidation;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Application.Abstractions;
using TaskManagement.Application.Tasks;
using TaskManagement.Domain.Enums;

namespace TaskManagement.Application.Dashboard;

/// <summary><see cref="Overdue"/> overlaps Todo/InProgress and is not part of <see cref="Total"/> (DS-01, DS-02).</summary>
public sealed record DashboardSummaryDto(int Total, int Todo, int InProgress, int Completed, int Overdue);

public sealed class UpcomingTasksQuery
{
    public const int MaxLimit = 20;
    public const int MaxDays = 90;

    public int Limit { get; set; } = 5;
    public int Days { get; set; } = 7;
}

public sealed class RecentTasksQuery
{
    public int Limit { get; set; } = 5;
}

public sealed class UpcomingTasksQueryValidator : AbstractValidator<UpcomingTasksQuery>
{
    public UpcomingTasksQueryValidator()
    {
        RuleFor(x => x.Limit).InclusiveBetween(1, UpcomingTasksQuery.MaxLimit).WithMessage($"Số mục phải từ 1 đến {UpcomingTasksQuery.MaxLimit}.");
        RuleFor(x => x.Days).InclusiveBetween(1, UpcomingTasksQuery.MaxDays).WithMessage($"Số ngày phải từ 1 đến {UpcomingTasksQuery.MaxDays}.");
    }
}

public sealed class RecentTasksQueryValidator : AbstractValidator<RecentTasksQuery>
{
    public RecentTasksQueryValidator()
    {
        RuleFor(x => x.Limit).InclusiveBetween(1, UpcomingTasksQuery.MaxLimit).WithMessage($"Số mục phải từ 1 đến {UpcomingTasksQuery.MaxLimit}.");
    }
}

public interface IDashboardService
{
    Task<DashboardSummaryDto> GetSummaryAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<TaskDto>> GetUpcomingAsync(UpcomingTasksQuery query, CancellationToken cancellationToken);

    Task<IReadOnlyList<TaskDto>> GetRecentAsync(RecentTasksQuery query, CancellationToken cancellationToken);
}

internal sealed class DashboardService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<UpcomingTasksQuery> upcomingValidator,
    IValidator<RecentTasksQuery> recentValidator) : IDashboardService
{
    public async Task<DashboardSummaryDto> GetSummaryAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var now = clock.GetUtcNow(); // one instant for every figure, so they can never disagree (DS-05)

        // One round trip: conditional aggregates over the caller's rows only (BR-11).
        var summary = await db.Tasks.AsNoTracking()
            .Where(t => t.UserId == userId)
            .GroupBy(_ => 1)
            .Select(g => new DashboardSummaryDto(
                g.Count(),
                g.Count(t => t.Status == TaskItemStatus.Todo),
                g.Count(t => t.Status == TaskItemStatus.InProgress),
                g.Count(t => t.Status == TaskItemStatus.Completed),
                g.Count(t => t.DueDate < now && t.Status != TaskItemStatus.Completed)))
            .FirstOrDefaultAsync(cancellationToken);

        return summary ?? new DashboardSummaryDto(0, 0, 0, 0, 0);
    }

    public async Task<IReadOnlyList<TaskDto>> GetUpcomingAsync(UpcomingTasksQuery query, CancellationToken cancellationToken)
    {
        await upcomingValidator.ValidateAndThrowAsync(query, cancellationToken);

        var userId = currentUser.UserId;
        var now = clock.GetUtcNow();
        var until = now.AddDays(query.Days);

        var tasks = await db.Tasks.AsNoTracking()
            .Where(t => t.UserId == userId
                && t.Status != TaskItemStatus.Completed
                && t.DueDate >= now
                && t.DueDate <= until)
            .OrderBy(t => t.DueDate).ThenBy(t => t.Id)
            .Take(query.Limit)
            .ToListAsync(cancellationToken);

        return tasks.ConvertAll(t => TaskDto.From(t, now));
    }

    public async Task<IReadOnlyList<TaskDto>> GetRecentAsync(RecentTasksQuery query, CancellationToken cancellationToken)
    {
        await recentValidator.ValidateAndThrowAsync(query, cancellationToken);

        var userId = currentUser.UserId;
        var now = clock.GetUtcNow();

        var tasks = await db.Tasks.AsNoTracking()
            .Where(t => t.UserId == userId)
            .OrderByDescending(t => t.UpdatedAt).ThenBy(t => t.Id)
            .Take(query.Limit)
            .ToListAsync(cancellationToken);

        return tasks.ConvertAll(t => TaskDto.From(t, now));
    }
}
