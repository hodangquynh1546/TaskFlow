using System.Net;
using System.Net.Http.Json;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Security;

/// <summary>BR-10 / BR-11: one user can never read, change, delete or count another user's data.</summary>
[Collection(PostgresCollection.Name)]
public sealed class DataIsolationTests : IDisposable
{
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public DataIsolationTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private async Task<(TestUser Alice, TestUser Bob, Guid AliceTaskId, string Original)> TwoUsersAsync()
    {
        var alice = await _api.RegisterAsync();
        var bob = await _api.RegisterAsync();
        var task = await alice.CreateTaskAsync(new { title = "Việc bí mật của Alice", description = "riêng tư", priority = "High", status = "InProgress", dueDate = DateTimeOffset.UtcNow.AddDays(2) });
        return (alice, bob, task.GetProperty("id").GetGuid(), task.GetRawText());
    }

    [Fact]
    public async Task Another_user_cannot_read_a_task()
    {
        var (_, bob, taskId, _) = await TwoUsersAsync();

        await (await bob.Client.GetAsync($"/api/tasks/{taskId}")).ReadProblemAsync(404);
    }

    [Fact]
    public async Task Another_user_cannot_update_a_task_and_the_task_is_unchanged()
    {
        var (alice, bob, taskId, original) = await TwoUsersAsync();

        var response = await bob.Client.PutAsJsonAsync($"/api/tasks/{taskId}", new { title = "Bị chiếm", priority = "Low", status = "Completed" });

        await response.ReadProblemAsync(404);
        Assert.Equal(original, (await alice.GetJsonAsync($"/api/tasks/{taskId}")).GetRawText());
    }

    [Fact]
    public async Task Another_user_cannot_change_a_tasks_status_and_the_task_is_unchanged()
    {
        var (alice, bob, taskId, original) = await TwoUsersAsync();

        var response = await bob.Client.PatchAsJsonAsync($"/api/tasks/{taskId}/status", new { status = "Completed" });

        await response.ReadProblemAsync(404);
        Assert.Equal(original, (await alice.GetJsonAsync($"/api/tasks/{taskId}")).GetRawText());
    }

    [Fact]
    public async Task Another_user_cannot_delete_a_task_and_it_still_exists()
    {
        var (alice, bob, taskId, original) = await TwoUsersAsync();

        await (await bob.Client.DeleteAsync($"/api/tasks/{taskId}")).ReadProblemAsync(404);

        Assert.Equal(original, (await alice.GetJsonAsync($"/api/tasks/{taskId}")).GetRawText());
    }

    [Fact]
    public async Task Someone_elses_task_looks_exactly_like_a_task_that_does_not_exist()
    {
        var (_, bob, taskId, _) = await TwoUsersAsync();

        var foreign = await (await bob.Client.GetAsync($"/api/tasks/{taskId}")).ReadProblemAsync(404);
        var missing = await (await bob.Client.GetAsync($"/api/tasks/{Guid.NewGuid()}")).ReadProblemAsync(404);

        Assert.Equal(missing.GetProperty("title").GetString(), foreign.GetProperty("title").GetString());
        Assert.Equal(missing.GetProperty("detail").GetString(), foreign.GetProperty("detail").GetString());
        Assert.Equal(missing.GetProperty("status").GetInt32(), foreign.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task Lists_search_and_filters_only_ever_see_the_callers_tasks()
    {
        var (alice, bob, _, _) = await TwoUsersAsync();
        await bob.CreateTaskAsync("Việc của Bob");

        var bobList = await bob.GetJsonAsync("/api/tasks");
        var bobSearchForAlice = await bob.GetJsonAsync("/api/tasks?search=Alice");
        var bobHighPriority = await bob.GetJsonAsync("/api/tasks?priority=High&status=InProgress");

        Assert.Equal(["Việc của Bob"], bobList.Titles());
        Assert.Equal(1, bobList.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, bobSearchForAlice.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, bobHighPriority.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, (await alice.GetJsonAsync("/api/tasks")).GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Dashboard_figures_and_lists_exclude_other_users_tasks()
    {
        var (alice, bob, _, _) = await TwoUsersAsync();

        var summary = await bob.GetJsonAsync("/api/dashboard/summary");

        Assert.Equal(0, summary.GetProperty("total").GetInt32());
        Assert.Equal(0, summary.GetProperty("inProgress").GetInt32());
        Assert.Empty((await bob.GetJsonAsync("/api/dashboard/upcoming-tasks")).EnumerateArray());
        Assert.Empty((await bob.GetJsonAsync("/api/dashboard/recent-tasks")).EnumerateArray());
        Assert.Equal(1, (await alice.GetJsonAsync("/api/dashboard/summary")).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Naming_another_user_in_a_request_body_cannot_move_or_steal_a_task()
    {
        var (alice, bob, taskId, original) = await TwoUsersAsync();

        // Bob tries to create a task "for Alice" and to re-parent Alice's task to himself.
        var created = await bob.CreateTaskAsync(new { title = "Gửi cho Alice", userId = alice.Id });
        await bob.Client.PutAsJsonAsync($"/api/tasks/{taskId}", new { title = "x", priority = "Low", status = "Todo", userId = bob.Id });

        Assert.Equal(1, (await bob.GetJsonAsync("/api/tasks")).GetProperty("totalCount").GetInt32()); // only the task he made himself
        Assert.Equal(HttpStatusCode.NotFound, (await alice.Client.GetAsync($"/api/tasks/{created.GetProperty("id").GetGuid()}")).StatusCode);
        Assert.Equal(original, (await alice.GetJsonAsync($"/api/tasks/{taskId}")).GetRawText());
    }

    [Fact]
    public async Task Two_users_sharing_a_task_title_never_see_each_others_copy()
    {
        var alice = await _api.RegisterAsync();
        var bob = await _api.RegisterAsync();
        var a = (await alice.CreateTaskAsync("Trùng tên")).GetProperty("id").GetGuid();
        var b = (await bob.CreateTaskAsync("Trùng tên")).GetProperty("id").GetGuid();

        Assert.Equal([a], (await alice.GetJsonAsync("/api/tasks")).GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()));
        Assert.Equal([b], (await bob.GetJsonAsync("/api/tasks")).GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()));
    }
}
