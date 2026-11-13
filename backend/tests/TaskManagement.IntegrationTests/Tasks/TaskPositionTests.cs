using System.Net;
using System.Text.Json;
using TaskManagement.Domain.Enums;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Tasks;

/// <summary>"Where does this task sit in the list?" so the client can open the page that holds it.</summary>
[Collection(PostgresCollection.Name)]
public sealed class TaskPositionTests : IDisposable
{
    private readonly FrozenClock _clock = new();
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public TaskPositionTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString, clock: _clock);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private DateTimeOffset Now => _clock.Now;

    private static string Q(string path, params (string Key, string Value)[] pairs) =>
        path + "?" + string.Join('&', pairs.Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));

    [Fact]
    public async Task Reports_the_zero_based_index_and_the_page_it_falls_on()
    {
        var user = await _api.RegisterAsync();
        var ids = new List<Guid>();
        for (var i = 0; i < 25; i++)
        {
            ids.Add(await _api.SeedTaskAsync(user.Id, $"T{i:00}", created: Now.AddMinutes(-i))); // T00 is newest
        }

        var first = await user.GetJsonAsync(Q($"/api/tasks/{ids[0]}/position", ("pageSize", "10")));
        var eleventh = await user.GetJsonAsync(Q($"/api/tasks/{ids[10]}/position", ("pageSize", "10")));
        var last = await user.GetJsonAsync(Q($"/api/tasks/{ids[24]}/position", ("pageSize", "10")));

        Assert.Equal((1, 0), (first.GetProperty("page").GetInt32(), first.GetProperty("index").GetInt32()));
        Assert.Equal((2, 10), (eleventh.GetProperty("page").GetInt32(), eleventh.GetProperty("index").GetInt32()));
        Assert.Equal((3, 24), (last.GetProperty("page").GetInt32(), last.GetProperty("index").GetInt32()));
    }

    [Theory]
    [InlineData("createdAt", "asc")]
    [InlineData("startDate", "asc")]
    [InlineData("dueDate", "desc")]
    [InlineData("priority", "desc")]
    public async Task The_page_it_reports_is_the_page_the_list_really_puts_it_on(string sortBy, string sortDir)
    {
        var user = await _api.RegisterAsync();
        var statuses = new[] { TaskItemStatus.Todo, TaskItemStatus.Completed, TaskItemStatus.InProgress };
        var priorities = new[] { TaskPriority.Low, TaskPriority.Medium, TaskPriority.High };
        for (var i = 0; i < 17; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"T{i:00}", statuses[i % 3], priorities[i % 3],
                start: i % 4 == 0 ? null : Now.AddHours(i), due: i % 5 == 0 ? null : Now.AddDays(i), created: Now.AddMinutes(-i));
        }

        var all = new List<(string Title, Guid Id)>();
        for (var page = 1; page <= 3; page++)
        {
            var list = await user.GetJsonAsync(Q("/api/tasks", ("pageSize", "6"), ("page", page.ToString(System.Globalization.CultureInfo.InvariantCulture)), ("sortBy", sortBy), ("sortDir", sortDir)));
            all.AddRange(list.GetProperty("items").EnumerateArray().Select(i => (i.GetProperty("title").GetString()!, i.GetProperty("id").GetGuid())));
        }

        foreach (var (title, id) in all)
        {
            var position = await user.GetJsonAsync(Q($"/api/tasks/{id}/position", ("pageSize", "6"), ("sortBy", sortBy), ("sortDir", sortDir)));
            Assert.Equal(all.FindIndex(t => t.Id == id), position.GetProperty("index").GetInt32());
            Assert.Equal(all.FindIndex(t => t.Id == id) / 6 + 1, position.GetProperty("page").GetInt32());
            Assert.NotNull(title);
        }
    }

    [Fact]
    public async Task A_task_hidden_by_the_filters_is_not_found()
    {
        var user = await _api.RegisterAsync();
        var done = await _api.SeedTaskAsync(user.Id, "done", TaskItemStatus.Completed);

        var response = await user.Client.GetAsync(Q($"/api/tasks/{done}/position", ("status", "Todo")));

        await response.ReadProblemAsync(404);
    }

    [Fact]
    public async Task Someone_elses_task_and_a_missing_one_both_look_missing()
    {
        var mine = await _api.RegisterAsync();
        var theirs = await _api.RegisterAsync();
        var theirTask = await _api.SeedTaskAsync(theirs.Id, "theirs");

        await (await mine.Client.GetAsync($"/api/tasks/{theirTask}/position")).ReadProblemAsync(404);
        await (await mine.Client.GetAsync($"/api/tasks/{Guid.NewGuid()}/position")).ReadProblemAsync(404);
    }

    [Theory]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=51")]
    [InlineData("sortBy=nope")]
    public async Task Bad_query_values_are_a_400(string query)
    {
        var user = await _api.RegisterAsync();
        var id = await _api.SeedTaskAsync(user.Id, "x");

        await (await user.Client.GetAsync($"/api/tasks/{id}/position?{query}")).ReadProblemAsync(400);
    }

    [Fact]
    public async Task Signing_in_is_required()
    {
        var response = await _api.Anonymous().GetAsync($"/api/tasks/{Guid.NewGuid()}/position");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
