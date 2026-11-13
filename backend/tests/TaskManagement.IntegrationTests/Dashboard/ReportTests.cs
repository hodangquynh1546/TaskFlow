using System.Net;
using System.Text.Json;
using TaskManagement.Domain.Enums;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Dashboard;

/// <summary>
/// The report of time worked: finished tasks, placed on the day they start, summed by planned length.
/// Fixed past periods are used wherever the answer must not depend on today's date.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class ReportTests : IDisposable
{
    private readonly FrozenClock _clock = new();
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public ReportTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString, clock: _clock);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    // 2026-11-02 is a Monday: the week runs Nov 2-8.
    private static DateTimeOffset Utc(int month, int day, int hour = 0) => new(2026, month, day, hour, 0, 0, TimeSpan.Zero);

    private static Task<JsonElement> Report(TestUser user, string period, string? date, int offset = 0) =>
        user.GetJsonAsync($"/api/dashboard/report?period={period}&utcOffsetMinutes={offset}" + (date is null ? "" : $"&date={date}"));

    private static int[] Minutes(JsonElement report) => report.GetProperty("buckets").EnumerateArray().Select(b => b.GetProperty("minutes").GetInt32()).ToArray();

    private static int[] Counts(JsonElement report) => report.GetProperty("buckets").EnumerateArray().Select(b => b.GetProperty("completedTasks").GetInt32()).ToArray();

    [Fact]
    public async Task A_week_has_seven_days_from_Monday_and_sums_only_finished_tasks_that_start_that_day()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "mon-1", TaskItemStatus.Completed, start: Utc(11, 2, 8), durationMinutes: 60);
        await _api.SeedTaskAsync(user.Id, "mon-2", TaskItemStatus.Completed, start: Utc(11, 2, 10), durationMinutes: 30);
        await _api.SeedTaskAsync(user.Id, "wed", TaskItemStatus.Completed, start: Utc(11, 4, 9), durationMinutes: 120);
        await _api.SeedTaskAsync(user.Id, "sun-no-length", TaskItemStatus.Completed, start: Utc(11, 8, 9));
        // None of these belong: not finished, no start time, the week before, the week after.
        await _api.SeedTaskAsync(user.Id, "todo", TaskItemStatus.Todo, start: Utc(11, 3, 9), durationMinutes: 500);
        await _api.SeedTaskAsync(user.Id, "doing", TaskItemStatus.InProgress, start: Utc(11, 3, 9), durationMinutes: 500);
        await _api.SeedTaskAsync(user.Id, "unplaced", TaskItemStatus.Completed, durationMinutes: 500);
        await _api.SeedTaskAsync(user.Id, "before", TaskItemStatus.Completed, start: Utc(11, 1, 9), durationMinutes: 500);
        await _api.SeedTaskAsync(user.Id, "after", TaskItemStatus.Completed, start: Utc(11, 9, 9), durationMinutes: 500);

        var report = await Report(user, "week", "2026-11-05");

        Assert.Equal("2026-11-02", report.GetProperty("from").GetString());
        Assert.Equal("2026-11-08", report.GetProperty("to").GetString());
        Assert.Equal([90, 0, 120, 0, 0, 0, 0], Minutes(report));
        Assert.Equal([2, 0, 1, 0, 0, 0, 1], Counts(report));
        var totals = report.GetProperty("totals");
        Assert.Equal(4, totals.GetProperty("completedTasks").GetInt32());
        Assert.Equal(210, totals.GetProperty("minutes").GetInt32());
        Assert.Equal(7, totals.GetProperty("elapsedDays").GetInt32());
        Assert.Equal(30, totals.GetProperty("averagePerDayMinutes").GetInt32());
        Assert.Equal(JsonValueKind.Null, totals.GetProperty("averagePerWeekMinutes").ValueKind);
        Assert.Equal(JsonValueKind.Null, totals.GetProperty("averagePerMonthMinutes").ValueKind);
    }

    [Fact]
    public async Task Days_are_the_callers_own_so_the_same_task_lands_on_different_days_in_different_time_zones()
    {
        var user = await _api.RegisterAsync();
        // Sunday 18:00 UTC is already Monday 01:00 in Vietnam (UTC+7).
        await _api.SeedTaskAsync(user.Id, "late-sunday", TaskItemStatus.Completed, start: Utc(11, 8, 18), durationMinutes: 45);

        var utc = await Report(user, "week", "2026-11-04", offset: 0);
        var vietnam = await Report(user, "week", "2026-11-04", offset: 420);
        var nextWeekInVietnam = await Report(user, "week", "2026-11-09", offset: 420);

        Assert.Equal([0, 0, 0, 0, 0, 0, 45], Minutes(utc));
        Assert.Equal(0, vietnam.GetProperty("totals").GetProperty("minutes").GetInt32());
        Assert.Equal(45, Minutes(nextWeekInVietnam)[0]);
    }

    [Fact]
    public async Task A_month_has_one_bucket_per_day_and_reports_a_week_average()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "first", TaskItemStatus.Completed, start: Utc(10, 1, 9), durationMinutes: 300);
        await _api.SeedTaskAsync(user.Id, "last", TaskItemStatus.Completed, start: Utc(10, 31, 9), durationMinutes: 300);
        await _api.SeedTaskAsync(user.Id, "september", TaskItemStatus.Completed, start: Utc(9, 30, 9), durationMinutes: 999);
        await _api.SeedTaskAsync(user.Id, "november", TaskItemStatus.Completed, start: Utc(11, 1, 9), durationMinutes: 999);

        var report = await Report(user, "month", "2026-10-15");

        Assert.Equal(31, Minutes(report).Length);
        Assert.Equal(300, Minutes(report)[0]);
        Assert.Equal(300, Minutes(report)[30]);
        Assert.Equal("2026-10-31", report.GetProperty("to").GetString());
        var totals = report.GetProperty("totals");
        Assert.Equal(600, totals.GetProperty("minutes").GetInt32());
        Assert.Equal(31, totals.GetProperty("elapsedDays").GetInt32());
        Assert.Equal(19, totals.GetProperty("averagePerDayMinutes").GetInt32()); // 600 / 31 = 19.35
        Assert.Equal(135, totals.GetProperty("averagePerWeekMinutes").GetInt32()); // 19.35 * 7
        Assert.Equal(JsonValueKind.Null, totals.GetProperty("averagePerMonthMinutes").ValueKind);
    }

    [Fact]
    public async Task A_year_has_twelve_month_buckets_and_all_three_averages()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "jan", TaskItemStatus.Completed, start: new DateTimeOffset(2025, 1, 15, 9, 0, 0, TimeSpan.Zero), durationMinutes: 600);
        await _api.SeedTaskAsync(user.Id, "dec", TaskItemStatus.Completed, start: new DateTimeOffset(2025, 12, 31, 9, 0, 0, TimeSpan.Zero), durationMinutes: 300);
        await _api.SeedTaskAsync(user.Id, "other-year", TaskItemStatus.Completed, start: new DateTimeOffset(2024, 12, 31, 9, 0, 0, TimeSpan.Zero), durationMinutes: 999);

        var report = await Report(user, "year", "2025-06-01");

        Assert.Equal(12, Minutes(report).Length);
        Assert.Equal(600, Minutes(report)[0]);
        Assert.Equal(300, Minutes(report)[11]);
        Assert.Equal("2025-01-01", report.GetProperty("from").GetString());
        Assert.Equal("2025-12-31", report.GetProperty("to").GetString());
        var totals = report.GetProperty("totals");
        Assert.Equal(365, totals.GetProperty("elapsedDays").GetInt32());
        Assert.Equal(900, totals.GetProperty("minutes").GetInt32());
        Assert.Equal(2, totals.GetProperty("averagePerDayMinutes").GetInt32()); // 900 / 365 = 2.47
        Assert.Equal(17, totals.GetProperty("averagePerWeekMinutes").GetInt32());
        Assert.Equal(75, totals.GetProperty("averagePerMonthMinutes").GetInt32());
    }

    [Fact]
    public async Task The_current_period_is_averaged_over_the_days_that_have_happened_and_a_future_one_has_no_average()
    {
        var user = await _api.RegisterAsync();
        var today = DateOnly.FromDateTime(_clock.Now.UtcDateTime);

        var current = await Report(user, "week", null);
        var weekdaysSoFar = ((int)today.DayOfWeek + 6) % 7 + 1;
        Assert.Equal(weekdaysSoFar, current.GetProperty("totals").GetProperty("elapsedDays").GetInt32());

        var future = await Report(user, "week", today.AddDays(30).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture));
        Assert.Equal(0, future.GetProperty("totals").GetProperty("elapsedDays").GetInt32());
        Assert.Equal(0, future.GetProperty("totals").GetProperty("averagePerDayMinutes").GetInt32());
    }

    [Fact]
    public async Task Someone_elses_finished_tasks_never_appear()
    {
        var mine = await _api.RegisterAsync();
        var other = await _api.RegisterAsync();
        await _api.SeedTaskAsync(other.Id, "theirs", TaskItemStatus.Completed, start: Utc(11, 3, 9), durationMinutes: 480);

        var report = await Report(mine, "week", "2026-11-03");

        Assert.Equal(0, report.GetProperty("totals").GetProperty("minutes").GetInt32());
        Assert.Equal(0, report.GetProperty("totals").GetProperty("completedTasks").GetInt32());
    }

    [Theory]
    [InlineData("period=Decade")]
    [InlineData("period=week&utcOffsetMinutes=2000")]
    [InlineData("period=week&utcOffsetMinutes=-841")]
    [InlineData("period=week&date=not-a-date")]
    public async Task Bad_input_is_a_400(string query)
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.GetAsync("/api/dashboard/report?" + query);

        await response.ReadProblemAsync(400);
    }

    [Fact]
    public async Task Signing_in_is_required()
    {
        var response = await _api.Anonymous().GetAsync("/api/dashboard/report?period=week");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
