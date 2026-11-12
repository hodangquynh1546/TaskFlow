using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TaskManagement.Domain.Enums;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Tasks;

/// <summary>BR-13: tasks are blocks of time in a day, measured in minutes, with a start time and a duration.</summary>
[Collection(PostgresCollection.Name)]
public sealed class TaskDurationTests : IDisposable
{
    private readonly FrozenClock _clock = new();
    private readonly PostgresFixture _postgres;
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public TaskDurationTests(PostgresFixture postgres)
    {
        _postgres = postgres;
        _factory = new ApiFactory(postgres.ConnectionString, clock: _clock);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private DateTimeOffset Now => _clock.Now;

    private static string Iso(DateTimeOffset value) => value.ToString("O", System.Globalization.CultureInfo.InvariantCulture);

    private static Task<JsonElement> Page(TestUser user, params (string Key, string Value)[] pairs) =>
        user.GetJsonAsync("/api/tasks?" + string.Join('&', pairs.Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}")));

    // --- Create / read ----------------------------------------------------------------------------

    [Fact]
    public async Task A_task_without_a_duration_has_a_null_one()
    {
        var user = await _api.RegisterAsync();

        var task = await user.CreateTaskAsync("Không thời lượng");

        Assert.Equal(JsonValueKind.Null, task.GetProperty("durationMinutes").ValueKind);
    }

    [Theory]
    [InlineData(15)]
    [InlineData(30)]
    [InlineData(60)]
    [InlineData(120)]
    [InlineData(180)]
    [InlineData(240)]
    [InlineData(1440)]
    public async Task The_quick_durations_round_trip_through_create_and_get(int minutes)
    {
        var user = await _api.RegisterAsync();

        var created = await user.CreateTaskAsync(new { title = "Khối thời gian", startDate = Now.AddHours(1), durationMinutes = minutes });

        Assert.Equal(minutes, created.GetProperty("durationMinutes").GetInt32());
        var fetched = await user.GetJsonAsync($"/api/tasks/{created.GetProperty("id").GetGuid()}");
        Assert.Equal(minutes, fetched.GetProperty("durationMinutes").GetInt32());
    }

    [Fact]
    public async Task A_start_time_with_minutes_precision_is_kept_exactly()
    {
        var user = await _api.RegisterAsync();
        var start = new DateTimeOffset(2030, 5, 1, 9, 45, 0, TimeSpan.FromHours(7)); // 09:45 in Vietnam = 02:45Z

        var task = await user.CreateTaskAsync(new { title = "Họp", startDate = start, durationMinutes = 30 });

        Assert.Equal(new DateTimeOffset(2030, 5, 1, 2, 45, 0, TimeSpan.Zero), task.GetProperty("startDate").GetDateTimeOffset());
    }

    [Fact]
    public async Task A_duration_can_exist_without_a_start_time_as_an_estimate()
    {
        var user = await _api.RegisterAsync();

        var task = await user.CreateTaskAsync(new { title = "Ước lượng", durationMinutes = 45 });

        Assert.Equal(45, task.GetProperty("durationMinutes").GetInt32());
        Assert.Equal(JsonValueKind.Null, task.GetProperty("startDate").ValueKind);
    }

    [Theory]
    [InlineData("""{ "title": "x", "durationMinutes": 0 }""")]
    [InlineData("""{ "title": "x", "durationMinutes": -15 }""")]
    [InlineData("""{ "title": "x", "durationMinutes": 1441 }""")]
    [InlineData("""{ "title": "x", "durationMinutes": 2147483647 }""")]
    [InlineData("""{ "title": "x", "durationMinutes": "bốn mươi" }""")]
    [InlineData("""{ "title": "x", "durationMinutes": 30.5 }""")]
    public async Task Invalid_durations_are_400_with_the_field_named_and_create_nothing(string json)
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.PostAsync("/api/tasks", new StringContent(json, Encoding.UTF8, "application/json"));

        var problem = await response.ReadProblemAsync(400);
        Assert.NotEmpty(problem.ErrorsFor("durationMinutes"));
        Assert.Equal(0, (await user.GetJsonAsync("/api/tasks")).GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Boundary_durations_1_and_1440_are_accepted()
    {
        var user = await _api.RegisterAsync();

        Assert.Equal(HttpStatusCode.Created, (await user.Client.PostAsJsonAsync("/api/tasks", new { title = "a", durationMinutes = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await user.Client.PostAsJsonAsync("/api/tasks", new { title = "b", durationMinutes = 1440 })).StatusCode);
    }

    // --- Update / status ---------------------------------------------------------------------------

    [Fact]
    public async Task Put_replaces_the_duration()
    {
        var user = await _api.RegisterAsync();
        var created = await user.CreateTaskAsync(new { title = "Cũ", durationMinutes = 30 });
        var id = created.GetProperty("id").GetGuid();

        var response = await user.Client.PutAsJsonAsync($"/api/tasks/{id}", new { title = "Cũ", priority = "Medium", status = "Todo", durationMinutes = 120 });

        Assert.Equal(120, (await response.JsonAsync()).GetProperty("durationMinutes").GetInt32());
    }

    [Fact]
    public async Task Put_without_a_duration_or_with_null_clears_it_because_put_replaces_everything()
    {
        var user = await _api.RegisterAsync();
        var id = (await user.CreateTaskAsync(new { title = "Cũ", durationMinutes = 30 })).GetProperty("id").GetGuid();

        var omitted = await user.Client.PutAsJsonAsync($"/api/tasks/{id}", new { title = "Cũ", priority = "Medium", status = "Todo" });
        Assert.Equal(JsonValueKind.Null, (await omitted.JsonAsync()).GetProperty("durationMinutes").ValueKind);

        await user.Client.PutAsJsonAsync($"/api/tasks/{id}", new { title = "Cũ", priority = "Medium", status = "Todo", durationMinutes = 15 });
        var nulled = await user.Client.PutAsJsonAsync($"/api/tasks/{id}", new { title = "Cũ", priority = "Medium", status = "Todo", durationMinutes = (int?)null });
        Assert.Equal(JsonValueKind.Null, (await nulled.JsonAsync()).GetProperty("durationMinutes").ValueKind);
    }

    [Fact]
    public async Task An_invalid_duration_on_put_is_400_and_leaves_the_task_unchanged()
    {
        var user = await _api.RegisterAsync();
        var created = await user.CreateTaskAsync(new { title = "Giữ", durationMinutes = 60 });
        var id = created.GetProperty("id").GetGuid();

        var response = await user.Client.PutAsJsonAsync($"/api/tasks/{id}", new { title = "Đổi", priority = "High", status = "Completed", durationMinutes = 0 });

        Assert.NotEmpty((await response.ReadProblemAsync(400)).ErrorsFor("durationMinutes"));
        Assert.Equal(created.GetRawText(), (await user.GetJsonAsync($"/api/tasks/{id}")).GetRawText());
    }

    [Fact]
    public async Task Changing_status_keeps_the_duration()
    {
        var user = await _api.RegisterAsync();
        var id = (await user.CreateTaskAsync(new { title = "x", durationMinutes = 90 })).GetProperty("id").GetGuid();

        var response = await user.Client.PatchAsJsonAsync($"/api/tasks/{id}/status", new { status = "Completed" });

        Assert.Equal(90, (await response.JsonAsync()).GetProperty("durationMinutes").GetInt32());
    }

    // --- Day schedule: filter by start time and sort by start ---------------------------------------

    [Fact]
    public async Task A_days_schedule_is_the_tasks_starting_inside_that_days_boundaries_inclusive()
    {
        var user = await _api.RegisterAsync();
        var dayStart = new DateTimeOffset(Now.Year, Now.Month, Now.Day, 0, 0, 0, TimeSpan.Zero).AddDays(5);
        var dayEnd = dayStart.AddDays(1).AddMilliseconds(-1);
        await _api.SeedTaskAsync(user.Id, "trước-đó", start: dayStart.AddMilliseconds(-1), durationMinutes: 30);
        await _api.SeedTaskAsync(user.Id, "đầu-ngày", start: dayStart, durationMinutes: 30);
        await _api.SeedTaskAsync(user.Id, "giữa-ngày", start: dayStart.AddHours(12), durationMinutes: 60);
        await _api.SeedTaskAsync(user.Id, "cuối-ngày", start: dayEnd, durationMinutes: 15);
        await _api.SeedTaskAsync(user.Id, "ngày-sau", start: dayEnd.AddMilliseconds(1), durationMinutes: 15);
        await _api.SeedTaskAsync(user.Id, "chưa-xếp-giờ", durationMinutes: 45);

        var page = await Page(user, ("startFrom", Iso(dayStart)), ("startTo", Iso(dayEnd)), ("sortBy", "startDate"), ("sortDir", "asc"));

        Assert.Equal(["đầu-ngày", "giữa-ngày", "cuối-ngày"], page.Titles());
    }

    [Fact]
    public async Task Start_range_accepts_offsets_and_excludes_tasks_without_a_start()
    {
        var user = await _api.RegisterAsync();
        var start = Now.AddDays(3);
        await _api.SeedTaskAsync(user.Id, "có-giờ", start: start);
        await _api.SeedTaskAsync(user.Id, "không-giờ");

        var inVietnamTime = start.ToOffset(TimeSpan.FromHours(7));
        var page = await Page(user, ("startFrom", Iso(inVietnamTime)), ("startTo", Iso(inVietnamTime)));

        Assert.Equal(["có-giờ"], page.Titles());
    }

    [Fact]
    public async Task Sorting_by_start_puts_unscheduled_tasks_last_in_both_directions()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "s3", start: Now.AddHours(3), created: Now.AddMinutes(-5));
        await _api.SeedTaskAsync(user.Id, "none", created: Now.AddMinutes(-4));
        await _api.SeedTaskAsync(user.Id, "s1", start: Now.AddHours(1), created: Now.AddMinutes(-3));
        await _api.SeedTaskAsync(user.Id, "s2", start: Now.AddHours(2), created: Now.AddMinutes(-2));

        var asc = (await Page(user, ("sortBy", "startDate"), ("sortDir", "asc"))).Titles();
        var desc = (await Page(user, ("sortBy", "startDate"), ("sortDir", "desc"))).Titles();

        Assert.Equal(["s1", "s2", "s3", "none"], asc);
        Assert.Equal(["s3", "s2", "s1", "none"], desc);
    }

    [Fact]
    public async Task Tasks_starting_at_the_same_minute_are_returned_in_a_stable_order_across_pages()
    {
        var user = await _api.RegisterAsync();
        var same = Now.AddHours(2);
        for (var i = 0; i < 12; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"cùng-giờ-{i:00}", start: same, durationMinutes: 30);
        }

        var seen = new List<string>();
        foreach (var page in new[] { "1", "2", "3" })
        {
            seen.AddRange((await Page(user, ("sortBy", "startDate"), ("pageSize", "5"), ("page", page))).Titles());
        }

        Assert.Equal(12, seen.Count);
        Assert.Equal(12, seen.Distinct().Count());
    }

    [Fact]
    public async Task An_inverted_start_range_is_400()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.GetAsync($"/api/tasks?startFrom={Uri.EscapeDataString(Iso(Now.AddHours(2)))}&startTo={Uri.EscapeDataString(Iso(Now))}");

        Assert.NotEmpty((await response.ReadProblemAsync(400)).ErrorsFor("startFrom"));
    }

    [Fact]
    public async Task The_schedule_never_includes_another_users_tasks()
    {
        var alice = await _api.RegisterAsync();
        var bob = await _api.RegisterAsync();
        var start = Now.AddDays(2);
        await _api.SeedTaskAsync(alice.Id, "của-alice", start: start, durationMinutes: 60);
        await _api.SeedTaskAsync(bob.Id, "của-bob", start: start, durationMinutes: 60);

        var page = await Page(bob, ("startFrom", Iso(start.AddHours(-1))), ("startTo", Iso(start.AddHours(1))));

        Assert.Equal(["của-bob"], page.Titles());
    }

    [Fact]
    public async Task Dashboard_lists_carry_the_duration_too()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "có-thời-lượng", due: Now.AddHours(5), start: Now.AddHours(1), durationMinutes: 90);

        var upcoming = await user.GetJsonAsync("/api/dashboard/upcoming-tasks");
        var recent = await user.GetJsonAsync("/api/dashboard/recent-tasks");

        Assert.Equal(90, upcoming[0].GetProperty("durationMinutes").GetInt32());
        Assert.Equal(90, recent[0].GetProperty("durationMinutes").GetInt32());
    }

    // --- Database safety net -------------------------------------------------------------------------

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1441)]
    public async Task The_database_itself_rejects_out_of_range_durations(int minutes)
    {
        var user = await _api.RegisterAsync();
        await using var db = _postgres.CreateContext();

        var ex = await Assert.ThrowsAsync<PostgresException>(() => InsertRaw(db, user.Id, minutes));

        Assert.Equal(PostgresErrorCodes.CheckViolation, ex.SqlState);
        Assert.Equal("CK_Tasks_DurationMinutes", ex.ConstraintName);
    }

    [Fact]
    public async Task The_database_accepts_the_boundaries_and_null()
    {
        var user = await _api.RegisterAsync();
        await using var db = _postgres.CreateContext();

        Assert.Equal(1, await InsertRaw(db, user.Id, 1));
        Assert.Equal(1, await InsertRaw(db, user.Id, 1440));
        Assert.Equal(1, await InsertRaw(db, user.Id, null));
    }

    [Fact]
    public async Task The_start_date_index_exists_for_the_schedule_query()
    {
        await using var db = _postgres.CreateContext();

        var defs = await db.Database
            .SqlQuery<string>($"SELECT indexdef AS \"Value\" FROM pg_indexes WHERE tablename = 'Tasks' AND indexname = 'IX_Tasks_UserId_StartDate'")
            .ToListAsync();

        Assert.Single(defs);
        Assert.Contains("\"UserId\", \"StartDate\"", defs[0], StringComparison.Ordinal);
    }

    private Task<int> InsertRaw(TaskManagement.Infrastructure.Persistence.AppDbContext db, Guid userId, int? minutes) =>
        db.Database.ExecuteSqlAsync($"""
            INSERT INTO "Tasks" ("Id","UserId","Title","Status","Priority","DurationMinutes","CreatedAt","UpdatedAt")
            VALUES ({Guid.NewGuid()}, {userId}, {"x"}, {(int)TaskItemStatus.Todo}, {(int)TaskPriority.Medium}, {minutes}, {Now}, {Now})
            """);
}
