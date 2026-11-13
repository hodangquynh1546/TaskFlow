using FluentValidation;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Application.Abstractions;
using TaskManagement.Application.Tasks;
using TaskManagement.Domain.Enums;

namespace TaskManagement.Application.Dashboard;

/// <summary><see cref="Overdue"/> overlaps Todo/InProgress and is not part of <see cref="Total"/> (DS-01, DS-02).</summary>
public sealed record DashboardSummaryDto(int Total, int Todo, int InProgress, int Completed, int Overdue);

public enum ReportPeriod
{
    Week,
    Month,
    Year,
}

/// <summary>
/// Which calendar week, month or year to report on. Days are the caller's own, so the client sends its UTC offset
/// (one offset for the whole range, which is exact except across a daylight-saving change).
/// </summary>
public sealed class ReportQuery
{
    public const int MaxOffsetMinutes = 14 * 60;

    public ReportPeriod Period { get; set; } = ReportPeriod.Week;

    /// <summary>Any day inside the wanted period; today (in the caller's offset) when omitted.</summary>
    public DateOnly? Date { get; set; }

    public int UtcOffsetMinutes { get; set; }
}

public sealed class ReportQueryValidator : AbstractValidator<ReportQuery>
{
    public ReportQueryValidator()
    {
        RuleFor(x => x.Period).IsInEnum().WithMessage("Khoảng báo cáo không hợp lệ.");
        RuleFor(x => x.UtcOffsetMinutes).InclusiveBetween(-ReportQuery.MaxOffsetMinutes, ReportQuery.MaxOffsetMinutes).WithMessage("Múi giờ không hợp lệ.");
    }
}

/// <summary>One day (week and month reports) or one month (year report). <see cref="Minutes"/> is the planned length of the finished tasks.</summary>
public sealed record ReportBucketDto(DateOnly Start, int CompletedTasks, int Minutes);

/// <summary>
/// Averages are per elapsed day, so a half-finished month is not dragged down by days that have not happened.
/// A week is 7 average days and a month 30.4375; the week average is omitted in a week report and the month average
/// outside a year report, where they would just restate the total.
/// </summary>
public sealed record ReportTotalsDto(int CompletedTasks, int Minutes, int ElapsedDays, int AveragePerDayMinutes, int? AveragePerWeekMinutes, int? AveragePerMonthMinutes);

public sealed record ReportDto(ReportPeriod Period, DateOnly From, DateOnly To, IReadOnlyList<ReportBucketDto> Buckets, ReportTotalsDto Totals);

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

    Task<ReportDto> GetReportAsync(ReportQuery query, CancellationToken cancellationToken);
}

internal sealed class DashboardService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<UpcomingTasksQuery> upcomingValidator,
    IValidator<RecentTasksQuery> recentValidator,
    IValidator<ReportQuery> reportValidator) : IDashboardService
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
    /// <summary>
    /// Time worked = planned length of tasks that are Completed, placed on the day they start. Tasks without a start
    /// time are not on any day, and tasks without a length count as finished but add no hours.
    /// </summary>
    public async Task<ReportDto> GetReportAsync(ReportQuery query, CancellationToken cancellationToken)
    {
        await reportValidator.ValidateAndThrowAsync(query, cancellationToken);

        var userId = currentUser.UserId;
        var offset = TimeSpan.FromMinutes(query.UtcOffsetMinutes);
        var today = DateOnly.FromDateTime((clock.GetUtcNow() + offset).DateTime);
        var anchor = query.Date ?? today;

        var start = query.Period switch
        {
            ReportPeriod.Week => anchor.AddDays(-(((int)anchor.DayOfWeek + 6) % 7)),
            ReportPeriod.Month => new DateOnly(anchor.Year, anchor.Month, 1),
            _ => new DateOnly(anchor.Year, 1, 1),
        };
        var endExclusive = query.Period switch
        {
            ReportPeriod.Week => start.AddDays(7),
            ReportPeriod.Month => start.AddMonths(1),
            _ => start.AddYears(1),
        };

        DateTimeOffset Instant(DateOnly day) => new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), offset).ToUniversalTime();
        var from = Instant(start);
        var to = Instant(endExclusive);

        var finished = await db.Tasks.AsNoTracking()
            .Where(t => t.UserId == userId && t.Status == TaskItemStatus.Completed && t.StartDate >= from && t.StartDate < to)
            .Select(t => new { t.StartDate, t.DurationMinutes })
            .ToListAsync(cancellationToken);

        var byYear = query.Period == ReportPeriod.Year;
        var minutes = new Dictionary<DateOnly, int>();
        var counts = new Dictionary<DateOnly, int>();
        foreach (var task in finished)
        {
            var day = DateOnly.FromDateTime(task.StartDate!.Value.ToOffset(offset).DateTime);
            var key = byYear ? new DateOnly(day.Year, day.Month, 1) : day;
            counts[key] = counts.GetValueOrDefault(key) + 1;
            minutes[key] = minutes.GetValueOrDefault(key) + (task.DurationMinutes ?? 0);
        }

        var buckets = new List<ReportBucketDto>();
        for (var cursor = start; cursor < endExclusive; cursor = byYear ? cursor.AddMonths(1) : cursor.AddDays(1))
        {
            buckets.Add(new ReportBucketDto(cursor, counts.GetValueOrDefault(cursor), minutes.GetValueOrDefault(cursor)));
        }

        var elapsedEnd = endExclusive < today.AddDays(1) ? endExclusive : today.AddDays(1);
        var elapsedDays = Math.Max(0, elapsedEnd.DayNumber - start.DayNumber);
        var totalMinutes = buckets.Sum(b => b.Minutes);
        var perDay = elapsedDays == 0 ? 0.0 : (double)totalMinutes / elapsedDays;

        var totals = new ReportTotalsDto(
            buckets.Sum(b => b.CompletedTasks),
            totalMinutes,
            elapsedDays,
            (int)Math.Round(perDay),
            query.Period == ReportPeriod.Week ? null : (int)Math.Round(perDay * 7),
            byYear ? (int)Math.Round(perDay * 365.25 / 12) : null);

        return new ReportDto(query.Period, start, endExclusive.AddDays(-1), buckets, totals);
    }
}
