using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Domain.Enums;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Tasks;

/// <summary>Repeating tasks: finishing one creates the next, once.</summary>
[Collection(PostgresCollection.Name)]
public sealed class RecurringTasksTests : IDisposable
{
    private readonly FrozenClock _clock = new();
    private readonly PostgresFixture _postgres;
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public RecurringTasksTests(PostgresFixture postgres)
    {
        _postgres = postgres;
        _factory = new ApiFactory(postgres.ConnectionString, clock: _clock);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private DateTimeOffset Now => _clock.Now;

    private static object Daily(int interval = 1, DateTimeOffset? until = null) =>
        new { frequency = "Daily", interval, weekdays = 0, until, utcOffsetMinutes = 0 };

    private static Task<HttpResponseMessage> Finish(TestUser user, Guid id) =>
        user.Client.PatchAsJsonAsync($"/api/tasks/{id}/status", new { status = "Completed" });

    private static Task<HttpResponseMessage> Reopen(TestUser user, Guid id) =>
        user.Client.PatchAsJsonAsync($"/api/tasks/{id}/status", new { status = "Todo" });

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task<List<JsonElement>> All(TestUser user) =>
        (await user.GetJsonAsync("/api/tasks?pageSize=50&sortBy=startDate&sortDir=asc")).GetProperty("items").EnumerateArray().ToList();

    // --- Saving a repeat -------------------------------------------------------------------------

    [Fact]
    public async Task A_repeat_is_saved_and_comes_back_with_the_task()
    {
        var user = await _api.RegisterAsync();
        var created = await user.CreateTaskAsync(new
        {
            title = "Tập thể dục", startDate = Now.AddDays(1), durationMinutes = 30,
            recurrence = new { frequency = "Weekly", interval = 2, weekdays = 5, until = (DateTimeOffset?)null, utcOffsetMinutes = 420 },
        });

        var fetched = await user.GetJsonAsync($"/api/tasks/{created.GetProperty("id").GetGuid()}");

        var repeat = fetched.GetProperty("recurrence");
        Assert.Equal("Weekly", repeat.GetProperty("frequency").GetString());
        Assert.Equal(2, repeat.GetProperty("interval").GetInt32());
        Assert.Equal(5, repeat.GetProperty("weekdays").GetInt32());
        Assert.Equal(420, repeat.GetProperty("utcOffsetMinutes").GetInt32());
        Assert.Equal(JsonValueKind.Null, repeat.GetProperty("until").ValueKind);
    }

    [Fact]
    public async Task A_task_that_does_not_repeat_has_a_null_repeat_and_nothing_is_created_when_it_is_finished()
    {
        var user = await _api.RegisterAsync();
        var task = await user.CreateTaskAsync(new { title = "Một lần", startDate = Now.AddDays(1) });
        Assert.Equal(JsonValueKind.Null, task.GetProperty("recurrence").ValueKind);

        var finished = await Json(await Finish(user, task.GetProperty("id").GetGuid()));

        Assert.Equal(JsonValueKind.Null, finished.GetProperty("next").ValueKind);
        Assert.Single(await All(user));
    }

    [Theory]
    [InlineData("""{ "title": "x", "recurrence": { "frequency": "Daily", "interval": 1, "weekdays": 0, "utcOffsetMinutes": 0 } }""", "recurrence")] // no start time
    [InlineData("""{ "title": "x", "startDate": "2030-05-01T08:00:00Z", "recurrence": { "frequency": "Daily", "interval": 0, "weekdays": 0, "utcOffsetMinutes": 0 } }""", "recurrence.interval")]
    [InlineData("""{ "title": "x", "startDate": "2030-05-01T08:00:00Z", "recurrence": { "frequency": "Daily", "interval": 100, "weekdays": 0, "utcOffsetMinutes": 0 } }""", "recurrence.interval")]
    [InlineData("""{ "title": "x", "startDate": "2030-05-01T08:00:00Z", "recurrence": { "frequency": "Daily", "interval": 1, "weekdays": 3, "utcOffsetMinutes": 0 } }""", "recurrence.weekdays")]
    [InlineData("""{ "title": "x", "startDate": "2030-05-01T08:00:00Z", "recurrence": { "frequency": "Weekly", "interval": 1, "weekdays": 200, "utcOffsetMinutes": 0 } }""", "recurrence.weekdays")]
    [InlineData("""{ "title": "x", "startDate": "2030-05-01T08:00:00Z", "recurrence": { "frequency": "Daily", "interval": 1, "weekdays": 0, "utcOffsetMinutes": 5000 } }""", "recurrence.utcOffsetMinutes")]
    [InlineData("""{ "title": "x", "startDate": "2030-05-10T08:00:00Z", "recurrence": { "frequency": "Daily", "interval": 1, "weekdays": 0, "until": "2030-05-01T00:00:00Z", "utcOffsetMinutes": 0 } }""", "recurrence")]
    [InlineData("""{ "title": "x", "startDate": "2030-05-01T08:00:00Z", "recurrence": { "frequency": "Hourly", "interval": 1, "weekdays": 0, "utcOffsetMinutes": 0 } }""", "recurrence.frequency")]
    public async Task A_repeat_that_makes_no_sense_is_a_400_naming_the_field_and_creates_nothing(string json, string field)
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.PostAsync("/api/tasks", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));

        var problem = await response.ReadProblemAsync(400);
        Assert.True(problem.GetProperty("errors").EnumerateObject().Any(e => e.Name.Equals(field, StringComparison.OrdinalIgnoreCase)), problem.GetRawText());
        Assert.Empty(await All(user));
    }

    [Fact]
    public async Task Editing_can_add_change_and_remove_a_repeat()
    {
        var user = await _api.RegisterAsync();
        var created = await user.CreateTaskAsync(new { title = "Đổi lặp", startDate = Now.AddDays(1) });
        var url = $"/api/tasks/{created.GetProperty("id").GetGuid()}";
        object Body(object? recurrence) => new { title = "Đổi lặp", priority = "Medium", status = "Todo", startDate = Now.AddDays(1), recurrence };

        var added = await Json(await user.Client.PutAsJsonAsync(url, Body(Daily(3))));
        Assert.Equal(3, added.GetProperty("recurrence").GetProperty("interval").GetInt32());

        var removed = await Json(await user.Client.PutAsJsonAsync(url, Body(null)));
        Assert.Equal(JsonValueKind.Null, removed.GetProperty("recurrence").ValueKind);
    }

    // --- Finishing -------------------------------------------------------------------------------

    [Fact]
    public async Task Finishing_a_repeating_task_creates_the_next_occurrence_with_the_same_details_and_says_so()
    {
        var user = await _api.RegisterAsync();
        var start = Now.AddHours(2);
        var created = await user.CreateTaskAsync(new
        {
            title = "Uống thuốc", description = "sau ăn", priority = "High", startDate = start, durationMinutes = 15, recurrence = Daily(),
        });

        var finished = await Json(await Finish(user, created.GetProperty("id").GetGuid()));

        var next = finished.GetProperty("next");
        Assert.Equal(start.AddDays(1), next.GetProperty("startDate").GetDateTimeOffset());
        var tasks = await All(user);
        Assert.Equal(2, tasks.Count);
        var spawned = tasks.Single(t => t.GetProperty("id").GetGuid() == next.GetProperty("id").GetGuid());
        Assert.Equal("Uống thuốc", spawned.GetProperty("title").GetString());
        Assert.Equal("sau ăn", spawned.GetProperty("description").GetString());
        Assert.Equal("High", spawned.GetProperty("priority").GetString());
        Assert.Equal("Todo", spawned.GetProperty("status").GetString());
        Assert.Equal(15, spawned.GetProperty("durationMinutes").GetInt32());
        Assert.Equal(start.AddDays(1).AddMinutes(15), spawned.GetProperty("dueDate").GetDateTimeOffset());
        Assert.Equal("Daily", spawned.GetProperty("recurrence").GetProperty("frequency").GetString());
        Assert.Equal("Completed", tasks.Single(t => t.GetProperty("id").GetGuid() == created.GetProperty("id").GetGuid()).GetProperty("status").GetString());
    }

    [Fact]
    public async Task The_chain_goes_on_each_finished_occurrence_makes_the_next()
    {
        var user = await _api.RegisterAsync();
        var start = Now.AddHours(1);
        var current = (await user.CreateTaskAsync(new { title = "Chuỗi", startDate = start, recurrence = Daily() })).GetProperty("id").GetGuid();

        for (var day = 1; day <= 3; day++)
        {
            var next = (await Json(await Finish(user, current))).GetProperty("next");
            Assert.Equal(start.AddDays(day), next.GetProperty("startDate").GetDateTimeOffset());
            current = next.GetProperty("id").GetGuid();
        }

        Assert.Equal(4, (await All(user)).Count);
    }

    [Fact]
    public async Task Re_opening_and_finishing_again_does_not_make_a_second_next_occurrence()
    {
        var user = await _api.RegisterAsync();
        var id = (await user.CreateTaskAsync(new { title = "Một lần thôi", startDate = Now.AddHours(1), recurrence = Daily() })).GetProperty("id").GetGuid();

        await Finish(user, id);
        await Reopen(user, id);
        var again = await Json(await Finish(user, id));

        Assert.Equal(JsonValueKind.Null, again.GetProperty("next").ValueKind);
        Assert.Equal(2, (await All(user)).Count);
    }

    [Fact]
    public async Task Finishing_by_editing_the_status_in_a_full_update_creates_the_next_one_too()
    {
        var user = await _api.RegisterAsync();
        var start = Now.AddHours(1);
        var id = (await user.CreateTaskAsync(new { title = "Qua PUT", startDate = start, recurrence = Daily() })).GetProperty("id").GetGuid();

        var updated = await Json(await user.Client.PutAsJsonAsync($"/api/tasks/{id}", new { title = "Qua PUT", priority = "Medium", status = "Completed", startDate = start, recurrence = Daily() }));

        Assert.Equal(start.AddDays(1), updated.GetProperty("next").GetProperty("startDate").GetDateTimeOffset());
        Assert.Equal(2, (await All(user)).Count);
    }

    [Fact]
    public async Task Moving_to_in_progress_creates_nothing_only_finishing_does()
    {
        var user = await _api.RegisterAsync();
        var id = (await user.CreateTaskAsync(new { title = "Đang làm", startDate = Now.AddHours(1), recurrence = Daily() })).GetProperty("id").GetGuid();

        await user.Client.PatchAsJsonAsync($"/api/tasks/{id}/status", new { status = "InProgress" });

        Assert.Single(await All(user));
    }

    [Fact]
    public async Task A_series_stops_after_its_end_day()
    {
        var user = await _api.RegisterAsync();
        var start = Now.AddHours(1);
        var id = (await user.CreateTaskAsync(new { title = "Có hạn chót", startDate = start, recurrence = Daily(until: start.AddDays(1).AddHours(5)) })).GetProperty("id").GetGuid();

        var second = (await Json(await Finish(user, id))).GetProperty("next");
        var third = await Json(await Finish(user, second.GetProperty("id").GetGuid()));

        Assert.Equal(JsonValueKind.Null, third.GetProperty("next").ValueKind);
        Assert.Equal(2, (await All(user)).Count);
    }

    [Fact]
    public async Task A_task_finished_days_late_gets_the_next_occurrence_still_to_come_not_a_pile_of_past_ones()
    {
        var user = await _api.RegisterAsync();
        var longAgo = Now.AddDays(-10);
        var id = await _api.SeedTaskAsync(user.Id, "Trễ", start: longAgo, durationMinutes: 30, recurrence: new TaskManagement.Domain.Entities.Recurrence(RecurrenceFrequency.Daily, 1, 0, null, 0));

        var next = (await Json(await Finish(user, id))).GetProperty("next").GetProperty("startDate").GetDateTimeOffset();

        Assert.True(next > Now);
        Assert.True(next <= Now.AddDays(1));
        Assert.Equal(2, (await All(user)).Count);
    }

    [Fact]
    public async Task Weekly_on_chosen_days_uses_the_users_own_weekdays()
    {
        var user = await _api.RegisterAsync();
        // 02:00 on a Monday in Vietnam (UTC+7), a week from now at least, so it is still to come.
        var local = Now.ToOffset(TimeSpan.FromHours(7)).Date.AddDays(8);
        var monday = local.AddDays(-(((int)local.DayOfWeek + 6) % 7));
        var start = new DateTimeOffset(monday.AddDays(7).AddHours(2), TimeSpan.FromHours(7));
        var id = (await user.CreateTaskAsync(new
        {
            title = "Thứ Hai và thứ Tư", startDate = start,
            recurrence = new { frequency = "Weekly", interval = 1, weekdays = 1 | 4, until = (DateTimeOffset?)null, utcOffsetMinutes = 420 },
        })).GetProperty("id").GetGuid();

        var next = (await Json(await Finish(user, id))).GetProperty("next").GetProperty("startDate").GetDateTimeOffset().ToOffset(TimeSpan.FromHours(7));

        Assert.Equal(DayOfWeek.Wednesday, next.DayOfWeek);
        Assert.Equal(2, next.Hour);
        Assert.Equal(start.AddDays(2), next);
    }

    [Fact]
    public async Task Finishing_someone_elses_repeating_task_is_a_404_and_creates_nothing()
    {
        var mine = await _api.RegisterAsync();
        var theirs = await _api.RegisterAsync();
        var theirTask = (await theirs.CreateTaskAsync(new { title = "Của họ", startDate = Now.AddHours(1), recurrence = Daily() })).GetProperty("id").GetGuid();

        await (await Finish(mine, theirTask)).ReadProblemAsync(404);

        Assert.Single(await All(theirs));
        Assert.Empty(await All(mine));
    }

    [Fact]
    public async Task The_next_occurrence_belongs_to_the_same_user_in_the_database()
    {
        var user = await _api.RegisterAsync();
        var id = (await user.CreateTaskAsync(new { title = "Chủ", startDate = Now.AddHours(1), recurrence = Daily() })).GetProperty("id").GetGuid();

        var next = (await Json(await Finish(user, id))).GetProperty("next").GetProperty("id").GetGuid();

        await using var db = _postgres.CreateContext();
        var stored = await db.Tasks.SingleAsync(t => t.Id == next);
        Assert.Equal(user.Id, stored.UserId);
        Assert.False(stored.RecurrenceSpawned);
        Assert.True((await db.Tasks.SingleAsync(t => t.Id == id)).RecurrenceSpawned);
    }

    [Fact]
    public async Task Repeat_errors_are_translated()
    {
        var user = await _api.RegisterAsync();
        user.Client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("ja");

        var response = await user.Client.PostAsync("/api/tasks", new StringContent("""{ "title": "x", "recurrence": { "frequency": "Daily", "interval": 1, "weekdays": 0, "utcOffsetMinutes": 0 } }""", System.Text.Encoding.UTF8, "application/json"));

        var problem = await response.ReadProblemAsync(400);
        Assert.Contains("繰り返しのタスクには開始時刻が必要です。", problem.GetRawText(), StringComparison.Ordinal);
    }
}
