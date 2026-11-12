using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using TaskManagement.Domain.Enums;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Dashboard;

[Collection(PostgresCollection.Name)]
public sealed class DashboardTests : IDisposable
{
    private readonly FrozenClock _clock = new();
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public DashboardTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString, clock: _clock);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private DateTimeOffset Now => _clock.Now;

    private static (int Total, int Todo, int InProgress, int Completed, int Overdue) Read(JsonElement s) => (
        s.GetProperty("total").GetInt32(),
        s.GetProperty("todo").GetInt32(),
        s.GetProperty("inProgress").GetInt32(),
        s.GetProperty("completed").GetInt32(),
        s.GetProperty("overdue").GetInt32());

    private static string[] TitlesOf(JsonElement array) => array.EnumerateArray().Select(i => i.GetProperty("title").GetString()!).ToArray();

    // --- Summary ---------------------------------------------------------------------------------

    [Fact]
    public async Task A_new_user_sees_zeros_and_empty_lists()
    {
        var user = await _api.RegisterAsync();

        Assert.Equal((0, 0, 0, 0, 0), Read(await user.GetJsonAsync("/api/dashboard/summary")));
        var upcoming = await user.GetJsonAsync("/api/dashboard/upcoming-tasks");
        var recent = await user.GetJsonAsync("/api/dashboard/recent-tasks");
        Assert.Equal(JsonValueKind.Array, upcoming.ValueKind);
        Assert.Equal(JsonValueKind.Array, recent.ValueKind);
        Assert.Equal(0, upcoming.GetArrayLength() + recent.GetArrayLength());
    }

    [Fact]
    public async Task Summary_counts_each_status_and_overdue_from_real_data()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "todo-late", TaskItemStatus.Todo, due: Now.AddDays(-1));
        await _api.SeedTaskAsync(user.Id, "todo-ok", TaskItemStatus.Todo, due: Now.AddDays(1));
        await _api.SeedTaskAsync(user.Id, "todo-nodue", TaskItemStatus.Todo);
        await _api.SeedTaskAsync(user.Id, "doing-late", TaskItemStatus.InProgress, due: Now.AddHours(-1));
        await _api.SeedTaskAsync(user.Id, "doing-ok", TaskItemStatus.InProgress, due: Now.AddHours(5));
        await _api.SeedTaskAsync(user.Id, "done-late", TaskItemStatus.Completed, due: Now.AddDays(-9));
        await _api.SeedTaskAsync(user.Id, "done-1", TaskItemStatus.Completed);
        await _api.SeedTaskAsync(user.Id, "done-2", TaskItemStatus.Completed, due: Now.AddDays(3));
        await _api.SeedTaskAsync(user.Id, "done-3", TaskItemStatus.Completed);

        var summary = Read(await user.GetJsonAsync("/api/dashboard/summary"));

        Assert.Equal((9, 3, 2, 4, 2), summary);
        Assert.Equal(summary.Total, summary.Todo + summary.InProgress + summary.Completed); // DS-01
    }

    [Fact]
    public async Task Overdue_is_a_subset_that_does_not_add_to_the_total_and_excludes_completed_work()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "late", TaskItemStatus.Todo, due: Now.AddDays(-1));
        await _api.SeedTaskAsync(user.Id, "late-done", TaskItemStatus.Completed, due: Now.AddDays(-1));

        var summary = Read(await user.GetJsonAsync("/api/dashboard/summary"));

        Assert.Equal(2, summary.Total);
        Assert.Equal(1, summary.Overdue);
        Assert.Equal(1, summary.Todo);
    }

    [Fact]
    public async Task Overdue_boundary_a_task_due_exactly_now_is_not_overdue_one_second_earlier_is()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "exactly-now", due: Now);

        Assert.Equal(0, Read(await user.GetJsonAsync("/api/dashboard/summary")).Overdue);

        await _api.SeedTaskAsync(user.Id, "one-second-late", due: Now.AddSeconds(-1));
        Assert.Equal(1, Read(await user.GetJsonAsync("/api/dashboard/summary")).Overdue);
    }

    [Fact]
    public async Task Summary_follows_changes_made_through_the_api()
    {
        var user = await _api.RegisterAsync();
        var late = await user.CreateTaskAsync(new { title = "Trễ", dueDate = Now.AddDays(-1) });
        var lateId = late.GetProperty("id").GetGuid();
        await user.CreateTaskAsync("Bình thường");
        Assert.Equal((2, 2, 0, 0, 1), Read(await user.GetJsonAsync("/api/dashboard/summary")));

        await user.Client.PatchAsJsonAsync($"/api/tasks/{lateId}/status", new { status = "InProgress" });
        Assert.Equal((2, 1, 1, 0, 1), Read(await user.GetJsonAsync("/api/dashboard/summary")));

        await user.Client.PatchAsJsonAsync($"/api/tasks/{lateId}/status", new { status = "Completed" });
        Assert.Equal((2, 1, 0, 1, 0), Read(await user.GetJsonAsync("/api/dashboard/summary")));

        await user.Client.DeleteAsync($"/api/tasks/{lateId}");
        Assert.Equal((1, 1, 0, 0, 0), Read(await user.GetJsonAsync("/api/dashboard/summary")));
    }

    [Fact]
    public async Task Summary_agrees_with_the_task_list_endpoint_for_the_same_data()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "a", TaskItemStatus.Todo, due: Now.AddDays(-2));
        await _api.SeedTaskAsync(user.Id, "b", TaskItemStatus.InProgress, due: Now.AddDays(-1));
        await _api.SeedTaskAsync(user.Id, "c", TaskItemStatus.Completed, due: Now.AddDays(-1));
        await _api.SeedTaskAsync(user.Id, "d");

        var summary = Read(await user.GetJsonAsync("/api/dashboard/summary"));

        Assert.Equal(summary.Total, (await user.GetJsonAsync("/api/tasks")).GetProperty("totalCount").GetInt32());
        Assert.Equal(summary.Overdue, (await user.GetJsonAsync("/api/tasks?overdue=true")).GetProperty("totalCount").GetInt32());
        Assert.Equal(summary.Todo, (await user.GetJsonAsync("/api/tasks?status=Todo")).GetProperty("totalCount").GetInt32());
        Assert.Equal(summary.Completed, (await user.GetJsonAsync("/api/tasks?status=Completed")).GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Summary_only_counts_the_callers_data()
    {
        var alice = await _api.RegisterAsync();
        var bob = await _api.RegisterAsync();
        await _api.SeedTaskAsync(alice.Id, "a1");
        await _api.SeedTaskAsync(alice.Id, "a2", due: Now.AddDays(-1));
        await _api.SeedTaskAsync(bob.Id, "b1", TaskItemStatus.Completed);

        Assert.Equal((2, 2, 0, 0, 1), Read(await alice.GetJsonAsync("/api/dashboard/summary")));
        Assert.Equal((1, 0, 0, 1, 0), Read(await bob.GetJsonAsync("/api/dashboard/summary")));
    }

    // --- Upcoming --------------------------------------------------------------------------------

    [Fact]
    public async Task Upcoming_includes_open_tasks_due_from_now_through_seven_days_and_nothing_else()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "due-now", due: Now);
        await _api.SeedTaskAsync(user.Id, "day-7-exactly", due: Now.AddDays(7));
        await _api.SeedTaskAsync(user.Id, "day-7-plus-1s", due: Now.AddDays(7).AddSeconds(1));
        await _api.SeedTaskAsync(user.Id, "one-second-overdue", due: Now.AddSeconds(-1));
        await _api.SeedTaskAsync(user.Id, "completed-in-window", TaskItemStatus.Completed, due: Now.AddDays(2));
        await _api.SeedTaskAsync(user.Id, "in-progress-in-window", TaskItemStatus.InProgress, due: Now.AddDays(3));
        await _api.SeedTaskAsync(user.Id, "no-due");

        var upcoming = TitlesOf(await user.GetJsonAsync("/api/dashboard/upcoming-tasks"));

        Assert.Equal(["due-now", "in-progress-in-window", "day-7-exactly"], upcoming);
    }

    [Fact]
    public async Task Upcoming_is_ordered_by_due_date_and_respects_limit()
    {
        var user = await _api.RegisterAsync();
        for (var i = 7; i >= 1; i--)
        {
            await _api.SeedTaskAsync(user.Id, $"d{i}", due: Now.AddDays(i).AddHours(-1));
        }

        var byDefault = TitlesOf(await user.GetJsonAsync("/api/dashboard/upcoming-tasks"));
        var limited = TitlesOf(await user.GetJsonAsync("/api/dashboard/upcoming-tasks?limit=2"));

        Assert.Equal(["d1", "d2", "d3", "d4", "d5"], byDefault);
        Assert.Equal(["d1", "d2"], limited);
    }

    [Fact]
    public async Task Upcoming_days_parameter_widens_or_narrows_the_window()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "tomorrow", due: Now.AddHours(20));
        await _api.SeedTaskAsync(user.Id, "in-10-days", due: Now.AddDays(10));

        Assert.Equal(["tomorrow"], TitlesOf(await user.GetJsonAsync("/api/dashboard/upcoming-tasks?days=1")));
        Assert.Equal(["tomorrow"], TitlesOf(await user.GetJsonAsync("/api/dashboard/upcoming-tasks")));
        Assert.Equal(["tomorrow", "in-10-days"], TitlesOf(await user.GetJsonAsync("/api/dashboard/upcoming-tasks?days=30")));
    }

    [Fact]
    public async Task Upcoming_items_carry_the_full_task_shape()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "x", TaskItemStatus.InProgress, TaskPriority.High, due: Now.AddDays(1));

        var item = (await user.GetJsonAsync("/api/dashboard/upcoming-tasks"))[0];

        Assert.Equal("InProgress", item.GetProperty("status").GetString());
        Assert.Equal("High", item.GetProperty("priority").GetString());
        Assert.False(item.GetProperty("isOverdue").GetBoolean());
        Assert.False(item.TryGetProperty("userId", out _));
    }

    [Theory]
    [InlineData("limit=0")]
    [InlineData("limit=21")]
    [InlineData("limit=abc")]
    [InlineData("days=0")]
    [InlineData("days=91")]
    [InlineData("days=-3")]
    public async Task Upcoming_rejects_out_of_range_parameters(string query)
    {
        var user = await _api.RegisterAsync();

        await (await user.Client.GetAsync($"/api/dashboard/upcoming-tasks?{query}")).ReadProblemAsync(400);
    }

    // --- Recent ----------------------------------------------------------------------------------

    [Fact]
    public async Task Recent_lists_the_latest_updated_tasks_including_completed_ones()
    {
        var user = await _api.RegisterAsync();
        for (var i = 0; i < 8; i++)
        {
            var status = i == 0 ? TaskItemStatus.Completed : TaskItemStatus.Todo;
            await _api.SeedTaskAsync(user.Id, $"u{i}", status, created: Now.AddDays(-30), updated: Now.AddHours(-i - 1));
        }

        var recent = TitlesOf(await user.GetJsonAsync("/api/dashboard/recent-tasks"));

        Assert.Equal(["u0", "u1", "u2", "u3", "u4"], recent);
        Assert.Equal(["u0", "u1", "u2"], TitlesOf(await user.GetJsonAsync("/api/dashboard/recent-tasks?limit=3")));
    }

    [Fact]
    public async Task Touching_a_task_moves_it_to_the_top_of_recent()
    {
        var user = await _api.RegisterAsync();
        var oldest = await _api.SeedTaskAsync(user.Id, "oldest", created: Now.AddDays(-30), updated: Now.AddDays(-20));
        await _api.SeedTaskAsync(user.Id, "newer", created: Now.AddDays(-30), updated: Now.AddDays(-1));
        Assert.Equal("newer", TitlesOf(await user.GetJsonAsync("/api/dashboard/recent-tasks"))[0]);

        await user.Client.PatchAsJsonAsync($"/api/tasks/{oldest}/status", new { status = "InProgress" });

        Assert.Equal("oldest", TitlesOf(await user.GetJsonAsync("/api/dashboard/recent-tasks"))[0]);
    }

    [Theory]
    [InlineData("limit=0")]
    [InlineData("limit=21")]
    public async Task Recent_rejects_out_of_range_limits(string query)
    {
        var user = await _api.RegisterAsync();

        await (await user.Client.GetAsync($"/api/dashboard/recent-tasks?{query}")).ReadProblemAsync(400);
    }

    [Fact]
    public async Task Dashboard_endpoints_require_authentication()
    {
        var anonymous = _api.Anonymous();

        foreach (var path in new[] { "summary", "upcoming-tasks", "recent-tasks" })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/dashboard/{path}")).StatusCode);
        }
    }
}
