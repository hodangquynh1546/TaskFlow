using TaskManagement.Domain.Enums;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.Domain.Entities;

/// <summary>
/// How a task repeats: every <see cref="Interval"/> days, weeks, months or years, until an optional day.
/// Days of the week are a bit mask (Monday = 1 ... Sunday = 64); none means "the same weekday as the start".
/// The offset is the user's own, because "every Monday at 09:00" is a wall-clock rule: without it a task at 02:00 in
/// Vietnam (the evening before in UTC) would land on the wrong weekday.
/// </summary>
public sealed record Recurrence(RecurrenceFrequency Frequency, int Interval, int Weekdays, DateTimeOffset? Until, int UtcOffsetMinutes)
{
    public const int MaxInterval = 99;
    public const int AllWeekdays = 127;
    public const int MaxOffsetMinutes = 14 * 60;

    /// <summary>Longest run of past occurrences skipped when finding the next one (three years of a daily task).</summary>
    private const int MaxSkips = 1100;

    public static int WeekdayBit(DayOfWeek day) => 1 << (((int)day + 6) % 7);

    /// <summary>Throws the rule that is broken. The same rules are checked earlier, with field names, by the request validators.</summary>
    public void EnsureValid()
    {
        if (!Enum.IsDefined(Frequency))
        {
            throw new DomainException("Kiểu lặp không hợp lệ.", "recurrence");
        }

        if (Interval is < 1 or > MaxInterval)
        {
            throw new DomainException($"Khoảng lặp phải từ 1 đến {MaxInterval}.", "recurrence");
        }

        if (Weekdays is < 0 or > AllWeekdays || (Weekdays != 0 && Frequency != RecurrenceFrequency.Weekly))
        {
            throw new DomainException("Ngày lặp trong tuần không hợp lệ.", "recurrence");
        }

        if (UtcOffsetMinutes is < -MaxOffsetMinutes or > MaxOffsetMinutes)
        {
            throw new DomainException("Múi giờ không hợp lệ.", "recurrence");
        }
    }

    /// <summary>
    /// The start of the occurrence after the one starting at <paramref name="start"/>, at the same wall-clock time, or null when
    /// the series has ended. Months and years clamp to the end of a shorter month (31 January + 1 month = 28 February).
    /// </summary>
    public DateTimeOffset? NextAfter(DateTimeOffset start)
    {
        var offset = TimeSpan.FromMinutes(UtcOffsetMinutes);
        var local = start.ToOffset(offset).DateTime;

        var next = Frequency switch
        {
            RecurrenceFrequency.Daily => local.AddDays(Interval),
            RecurrenceFrequency.Weekly => NextWeekly(local),
            RecurrenceFrequency.Monthly => local.AddMonths(Interval),
            _ => local.AddYears(Interval),
        };

        if (Until is { } until && next.Date > until.ToOffset(offset).Date)
        {
            return null;
        }

        return new DateTimeOffset(next, offset).ToUniversalTime();
    }

    /// <summary>The first occurrence that starts after <paramref name="after"/>: a task finished late does not leave a trail of past-dated ones.</summary>
    public DateTimeOffset? NextStartAfter(DateTimeOffset start, DateTimeOffset after)
    {
        var next = NextAfter(start);
        for (var i = 0; i < MaxSkips && next is { } candidate && candidate <= after; i++)
        {
            next = NextAfter(candidate);
        }

        return next;
    }

    /// <summary>
    /// The starts of the next <paramref name="count"/> occurrences after <paramref name="start"/>, each the first one after
    /// <paramref name="after"/>, so a series saved with a start in the past does not begin with a run of past-dated tasks.
    /// Fewer come back when the series ends first.
    /// </summary>
    public IReadOnlyList<DateTimeOffset> FollowingStarts(DateTimeOffset start, DateTimeOffset after, int count)
    {
        var starts = new List<DateTimeOffset>();
        var current = start;
        while (starts.Count < count && NextStartAfter(current, after) is { } next)
        {
            starts.Add(next);
            current = next;
        }

        return starts;
    }

    private DateTime NextWeekly(DateTime local)
    {
        if (Weekdays == 0)
        {
            return local.AddDays(7 * Interval);
        }

        // Weeks count from the Monday of the week the task started in; only every Interval-th week takes part.
        var weekStart = local.Date.AddDays(-(((int)local.DayOfWeek + 6) % 7));
        for (var i = 1; i <= 7 * Interval + 7; i++)
        {
            var candidate = local.AddDays(i);
            var weeksSince = (candidate.Date - weekStart).Days / 7;
            if (weeksSince % Interval == 0 && (Weekdays & WeekdayBit(candidate.DayOfWeek)) != 0)
            {
                return candidate;
            }
        }

        return local.AddDays(7 * Interval);
    }
}
