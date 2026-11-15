using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.UnitTests.Domain;

public sealed class RecurrenceTests
{
    private static readonly TimeSpan Vietnam = TimeSpan.FromHours(7);

    private static Recurrence Rule(RecurrenceFrequency frequency, int interval = 1, int weekdays = 0, DateTimeOffset? until = null, int offset = 0) =>
        new(frequency, interval, weekdays, until, offset);

    private static DateTimeOffset At(int y, int m, int d, int h = 9, int min = 0, int offsetHours = 0) => new(y, m, d, h, min, 0, TimeSpan.FromHours(offsetHours));

    // 2026-11-16 is a Monday.
    private const int Mon = 1, Tue = 2, Wed = 4, Thu = 8, Fri = 16, Sat = 32, Sun = 64;

    [Theory]
    [InlineData(1, 17)]
    [InlineData(3, 19)]
    [InlineData(10, 26)]
    public void Daily_moves_by_the_interval_keeping_the_time_of_day(int interval, int expectedDay)
    {
        Assert.Equal(At(2026, 11, expectedDay), Rule(RecurrenceFrequency.Daily, interval).NextAfter(At(2026, 11, 16)));
    }

    [Theory]
    [InlineData(1, 23)]
    [InlineData(2, 30)]
    public void Weekly_without_chosen_days_repeats_on_the_same_weekday(int interval, int expectedDay)
    {
        Assert.Equal(At(2026, 11, expectedDay).ToUniversalTime(), Rule(RecurrenceFrequency.Weekly, interval).NextAfter(At(2026, 11, 16)));
    }

    [Fact]
    public void Weekly_with_chosen_days_walks_through_them_and_wraps_to_the_next_week()
    {
        var rule = Rule(RecurrenceFrequency.Weekly, 1, Mon | Wed | Fri);

        Assert.Equal(At(2026, 11, 18), rule.NextAfter(At(2026, 11, 16))); // Mon -> Wed
        Assert.Equal(At(2026, 11, 20), rule.NextAfter(At(2026, 11, 18))); // Wed -> Fri
        Assert.Equal(At(2026, 11, 23), rule.NextAfter(At(2026, 11, 20))); // Fri -> next Mon
    }

    [Fact]
    public void Weekly_starting_on_a_day_that_is_not_chosen_goes_to_the_next_chosen_day()
    {
        Assert.Equal(At(2026, 11, 18), Rule(RecurrenceFrequency.Weekly, 1, Mon | Wed).NextAfter(At(2026, 11, 17))); // Tue -> Wed
    }

    [Fact]
    public void Every_other_week_skips_the_week_in_between()
    {
        var rule = Rule(RecurrenceFrequency.Weekly, 2, Mon | Wed);

        Assert.Equal(At(2026, 11, 18), rule.NextAfter(At(2026, 11, 16))); // Mon -> Wed of the same week
        Assert.Equal(At(2026, 11, 30), rule.NextAfter(At(2026, 11, 18))); // Wed -> Monday two weeks on, not next week
    }

    [Fact]
    public void Weekdays_are_the_users_own_not_UTC_so_an_early_morning_task_keeps_its_day()
    {
        // 02:00 on Monday in Vietnam is still Sunday evening in UTC.
        var start = At(2026, 11, 16, 2, 0, 7);
        var rule = Rule(RecurrenceFrequency.Weekly, 1, Mon, offset: 420);

        var next = rule.NextAfter(start)!.Value;

        Assert.Equal(DayOfWeek.Sunday, next.UtcDateTime.DayOfWeek);
        Assert.Equal(DayOfWeek.Monday, next.ToOffset(Vietnam).DayOfWeek);
        Assert.Equal(At(2026, 11, 23, 2, 0, 7), next);
    }

    [Fact]
    public void Monthly_clamps_to_the_end_of_a_shorter_month_and_yearly_handles_leap_day()
    {
        Assert.Equal(At(2026, 2, 28), Rule(RecurrenceFrequency.Monthly).NextAfter(At(2026, 1, 31)));
        Assert.Equal(At(2029, 2, 28), Rule(RecurrenceFrequency.Yearly).NextAfter(At(2028, 2, 29)));
        Assert.Equal(At(2027, 1, 16), Rule(RecurrenceFrequency.Monthly, 2).NextAfter(At(2026, 11, 16)));
    }

    [Fact]
    public void An_end_day_stops_the_series_after_it_but_allows_it_on_that_day()
    {
        var rule = Rule(RecurrenceFrequency.Daily, until: At(2026, 11, 17, 23, 59));

        Assert.Equal(At(2026, 11, 17), rule.NextAfter(At(2026, 11, 16)));
        Assert.Null(rule.NextAfter(At(2026, 11, 17)));
    }

    [Fact]
    public void The_end_day_is_judged_on_the_users_calendar()
    {
        // The end day is the 17th for the person. 18th 01:00 in Vietnam is still the 17th in UTC, yet it is already the 18th for them.
        var rule = Rule(RecurrenceFrequency.Daily, until: At(2026, 11, 17, 23, 59, 7), offset: 420);

        Assert.Equal(At(2026, 11, 17, 9, 0, 7), rule.NextAfter(At(2026, 11, 16, 9, 0, 7)));
        Assert.Null(rule.NextAfter(At(2026, 11, 17, 9, 0, 7)));
    }

    [Fact]
    public void The_next_start_after_a_date_skips_past_occurrences_so_a_late_task_leaves_no_trail()
    {
        var rule = Rule(RecurrenceFrequency.Daily);
        var now = At(2026, 11, 20, 12);

        var next = rule.NextStartAfter(At(2026, 11, 10), now);

        Assert.Equal(At(2026, 11, 21), next);
    }

    [Fact]
    public void An_occurrence_still_to_come_is_not_skipped()
    {
        Assert.Equal(At(2026, 11, 17), Rule(RecurrenceFrequency.Daily).NextStartAfter(At(2026, 11, 16), At(2026, 11, 16, 8)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(100)]
    [InlineData(-1)]
    public void An_interval_outside_one_to_ninety_nine_is_refused(int interval)
    {
        Assert.Throws<DomainException>(() => Rule(RecurrenceFrequency.Daily, interval).EnsureValid());
    }

    [Theory]
    [InlineData(RecurrenceFrequency.Daily, 1)]
    [InlineData(RecurrenceFrequency.Monthly, Mon)]
    [InlineData(RecurrenceFrequency.Weekly, 128)]
    [InlineData(RecurrenceFrequency.Weekly, -1)]
    public void Weekdays_are_only_for_weekly_and_only_the_seven_bits(RecurrenceFrequency frequency, int weekdays)
    {
        Assert.Throws<DomainException>(() => Rule(frequency, 1, weekdays).EnsureValid());
    }

    [Fact]
    public void An_unknown_frequency_and_a_silly_time_zone_are_refused_and_a_sensible_rule_is_not()
    {
        Assert.Throws<DomainException>(() => Rule((RecurrenceFrequency)9).EnsureValid());
        Assert.Throws<DomainException>(() => Rule(RecurrenceFrequency.Daily, offset: 900).EnsureValid());
        Rule(RecurrenceFrequency.Weekly, 3, Mon | Sun, offset: -300).EnsureValid();
    }

    [Theory]
    [InlineData(DayOfWeek.Monday, Mon)]
    [InlineData(DayOfWeek.Wednesday, Wed)]
    [InlineData(DayOfWeek.Sunday, Sun)]
    [InlineData(DayOfWeek.Saturday, Sat)]
    [InlineData(DayOfWeek.Thursday, Thu)]
    [InlineData(DayOfWeek.Tuesday, Tue)]
    [InlineData(DayOfWeek.Friday, Fri)]
    public void Weekday_bits_run_Monday_to_Sunday(DayOfWeek day, int bit)
    {
        Assert.Equal(bit, Recurrence.WeekdayBit(day));
    }

    [Fact]
    public void A_task_cannot_repeat_without_a_start_time_but_can_with_one()
    {
        var rule = Rule(RecurrenceFrequency.Daily);
        var now = At(2026, 11, 15);

        Assert.Throws<DomainException>(() => TaskItem.Create(Guid.NewGuid(), "x", null, null, null, null, null, now, null, rule));
        var task = TaskItem.Create(Guid.NewGuid(), "x", null, null, null, At(2026, 11, 16), null, now, 30, rule);
        Assert.Equal(rule, task.Recurrence);
        Assert.False(task.RecurrenceSpawned);
    }
}
