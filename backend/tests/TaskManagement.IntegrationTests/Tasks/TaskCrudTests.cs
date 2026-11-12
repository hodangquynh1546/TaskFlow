using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Tasks;

[Collection(PostgresCollection.Name)]
public sealed class TaskCrudTests : IDisposable
{
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public TaskCrudTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private static async Task<int> CountAsync(TestUser user) => (await user.GetJsonAsync("/api/tasks")).GetProperty("totalCount").GetInt32();

    // --- Create ----------------------------------------------------------------------------------

    [Fact]
    public async Task Create_with_only_a_title_applies_the_defaults()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.PostAsJsonAsync("/api/tasks", new { title = "Viết báo cáo" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var task = await response.JsonAsync();
        Assert.Equal("Viết báo cáo", task.GetProperty("title").GetString());
        Assert.Equal("Todo", task.GetProperty("status").GetString());
        Assert.Equal("Medium", task.GetProperty("priority").GetString());
        Assert.Equal(JsonValueKind.Null, task.GetProperty("description").ValueKind);
        Assert.Equal(JsonValueKind.Null, task.GetProperty("startDate").ValueKind);
        Assert.Equal(JsonValueKind.Null, task.GetProperty("dueDate").ValueKind);
        Assert.False(task.GetProperty("isOverdue").GetBoolean());
        Assert.Equal(task.GetProperty("createdAt").GetDateTimeOffset(), task.GetProperty("updatedAt").GetDateTimeOffset());
        Assert.EndsWith($"/api/tasks/{task.GetProperty("id").GetGuid()}", response.Headers.Location!.AbsolutePath, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Create_with_every_field_round_trips_through_get()
    {
        var user = await _api.RegisterAsync();
        var start = new DateTimeOffset(2030, 5, 1, 8, 0, 0, TimeSpan.Zero);
        var due = new DateTimeOffset(2030, 5, 9, 17, 30, 0, TimeSpan.Zero);

        var created = await user.CreateTaskAsync(new
        {
            title = "Đầy đủ", description = "Dòng 1\nDòng 2", priority = "High", status = "InProgress", startDate = start, dueDate = due,
        });

        var fetched = await user.GetJsonAsync($"/api/tasks/{created.GetProperty("id").GetGuid()}");
        Assert.Equal(created.GetRawText(), fetched.GetRawText());
        Assert.Equal("Dòng 1\nDòng 2", fetched.GetProperty("description").GetString());
        Assert.Equal("High", fetched.GetProperty("priority").GetString());
        Assert.Equal("InProgress", fetched.GetProperty("status").GetString());
        Assert.Equal(start, fetched.GetProperty("startDate").GetDateTimeOffset());
        Assert.Equal(due, fetched.GetProperty("dueDate").GetDateTimeOffset());
    }

    [Fact]
    public async Task Create_response_has_no_owner_field()
    {
        var user = await _api.RegisterAsync();

        var task = await user.CreateTaskAsync("x");

        Assert.False(task.TryGetProperty("userId", out _));
        Assert.DoesNotContain(user.Id.ToString(), task.GetRawText(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Create_trims_the_title_and_turns_a_blank_description_into_null()
    {
        var user = await _api.RegisterAsync();

        var task = await user.CreateTaskAsync(new { title = "  Có khoảng trắng  ", description = "   " });

        Assert.Equal("Có khoảng trắng", task.GetProperty("title").GetString());
        Assert.Equal(JsonValueKind.Null, task.GetProperty("description").ValueKind);
    }

    [Fact]
    public async Task Create_stores_unicode_titles_unchanged()
    {
        var user = await _api.RegisterAsync();
        const string title = "Đặt vé ✈️ Hà Nội → Sài Gòn \"quote\" <b>tag</b>";

        var created = await user.CreateTaskAsync(new { title });

        Assert.Equal(title, (await user.GetJsonAsync($"/api/tasks/{created.GetProperty("id").GetGuid()}")).GetProperty("title").GetString());
    }

    [Fact]
    public async Task Offsets_in_dates_are_normalised_to_the_same_utc_instant()
    {
        var user = await _api.RegisterAsync();

        var task = await user.CreateTaskAsync(new { title = "Múi giờ", dueDate = "2030-12-01T23:30:00+07:00" });

        var due = task.GetProperty("dueDate").GetDateTimeOffset();
        Assert.Equal(TimeSpan.Zero, due.Offset);
        Assert.Equal(new DateTimeOffset(2030, 12, 1, 16, 30, 0, TimeSpan.Zero), due);
    }

    [Fact]
    public async Task Past_due_dates_are_allowed_on_creation_and_flagged_overdue()
    {
        var user = await _api.RegisterAsync();

        var task = await user.CreateTaskAsync(new { title = "Trễ hạn", dueDate = DateTimeOffset.UtcNow.AddDays(-2) });

        Assert.True(task.GetProperty("isOverdue").GetBoolean());
    }

    [Fact]
    public async Task Fields_that_must_never_come_from_the_client_are_ignored()
    {
        var user = await _api.RegisterAsync();
        var other = await _api.RegisterAsync();
        var forgedId = Guid.NewGuid();

        var created = await user.CreateTaskAsync(new
        {
            title = "Giả mạo", userId = other.Id, id = forgedId, createdAt = "2001-01-01T00:00:00Z", updatedAt = "2001-01-01T00:00:00Z", isOverdue = true,
        });

        Assert.NotEqual(forgedId, created.GetProperty("id").GetGuid());
        Assert.True(created.GetProperty("createdAt").GetDateTimeOffset() > DateTimeOffset.UtcNow.AddMinutes(-5));
        Assert.False(created.GetProperty("isOverdue").GetBoolean());
        Assert.Equal(1, await CountAsync(user));
        Assert.Equal(0, await CountAsync(other));
    }

    [Theory]
    [InlineData("""{ "title": "" }""", "title")]
    [InlineData("""{ "title": "   " }""", "title")]
    [InlineData("""{ "title": "ok", "description": "@@LONG@@" }""", "description")]
    [InlineData("""{ "title": "ok", "startDate": "2030-01-02T00:00:00Z", "dueDate": "2030-01-01T00:00:00Z" }""", "startDate")]
    [InlineData("""{ "title": "ok", "status": "Finished" }""", "status")]
    [InlineData("""{ "title": "ok", "status": 1 }""", "status")]
    [InlineData("""{ "title": "ok", "priority": "Urgent" }""", "priority")]
    [InlineData("""{ "title": "ok", "dueDate": "not a date" }""", "dueDate")]
    public async Task Invalid_create_requests_are_400_with_the_field_named_and_create_nothing(string json, string field)
    {
        var user = await _api.RegisterAsync();
        json = json.Replace("@@LONG@@", new string('d', 5001), StringComparison.Ordinal);

        var response = await user.Client.PostAsync("/api/tasks", new StringContent(json, Encoding.UTF8, "application/json"));

        var problem = await response.ReadProblemAsync(400);
        Assert.NotEmpty(problem.ErrorsFor(field));
        Assert.Equal(0, await CountAsync(user));
    }

    [Fact]
    public async Task Title_of_exactly_200_characters_is_accepted_and_201_is_rejected()
    {
        var user = await _api.RegisterAsync();

        var ok = await user.Client.PostAsJsonAsync("/api/tasks", new { title = new string('t', 200) });
        var tooLong = await user.Client.PostAsJsonAsync("/api/tasks", new { title = new string('t', 201) });

        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        Assert.NotEmpty((await tooLong.ReadProblemAsync(400)).ErrorsFor("title"));
    }

    [Fact]
    public async Task Equal_start_and_due_dates_are_accepted()
    {
        var user = await _api.RegisterAsync();
        var moment = DateTimeOffset.UtcNow.AddDays(1);

        var response = await user.Client.PostAsJsonAsync("/api/tasks", new { title = "Cùng lúc", startDate = moment, dueDate = moment });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    // --- Get -------------------------------------------------------------------------------------

    [Fact]
    public async Task Get_unknown_id_is_404_problem()
    {
        var user = await _api.RegisterAsync();

        var problem = await (await user.Client.GetAsync($"/api/tasks/{Guid.NewGuid()}")).ReadProblemAsync(404);

        Assert.Equal("Không tìm thấy công việc.", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task A_malformed_id_is_404_not_a_server_error()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.GetAsync("/api/tasks/not-a-guid");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- Update (PUT) ----------------------------------------------------------------------------

    [Fact]
    public async Task Put_replaces_every_field_and_keeps_created_time()
    {
        var user = await _api.RegisterAsync();
        var original = await user.CreateTaskAsync(new { title = "Cũ", description = "mô tả cũ", priority = "Low", dueDate = DateTimeOffset.UtcNow.AddDays(3) });
        var id = original.GetProperty("id").GetGuid();
        var newDue = new DateTimeOffset(2031, 1, 1, 12, 0, 0, TimeSpan.Zero);

        var response = await user.Client.PutAsJsonAsync($"/api/tasks/{id}", new
        {
            title = "Mới", description = "mô tả mới", priority = "High", status = "InProgress", startDate = newDue.AddDays(-1), dueDate = newDue,
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.JsonAsync();
        Assert.Equal(id, updated.GetProperty("id").GetGuid());
        Assert.Equal("Mới", updated.GetProperty("title").GetString());
        Assert.Equal("mô tả mới", updated.GetProperty("description").GetString());
        Assert.Equal("High", updated.GetProperty("priority").GetString());
        Assert.Equal("InProgress", updated.GetProperty("status").GetString());
        Assert.Equal(newDue, updated.GetProperty("dueDate").GetDateTimeOffset());
        Assert.Equal(original.GetProperty("createdAt").GetDateTimeOffset(), updated.GetProperty("createdAt").GetDateTimeOffset());
        Assert.True(updated.GetProperty("updatedAt").GetDateTimeOffset() > original.GetProperty("updatedAt").GetDateTimeOffset());
        Assert.Equal(updated.GetRawText(), (await user.GetJsonAsync($"/api/tasks/{id}")).GetRawText());
    }

    [Fact]
    public async Task Put_with_null_optional_fields_clears_them()
    {
        var user = await _api.RegisterAsync();
        var original = await user.CreateTaskAsync(new
        {
            title = "Có đủ", description = "mô tả", startDate = DateTimeOffset.UtcNow, dueDate = DateTimeOffset.UtcNow.AddDays(1),
        });

        var response = await user.Client.PutAsJsonAsync($"/api/tasks/{original.GetProperty("id").GetGuid()}", new
        {
            title = "Đã xóa bớt", description = (string?)null, priority = "Medium", status = "Todo", startDate = (DateTimeOffset?)null, dueDate = (DateTimeOffset?)null,
        });

        var updated = await response.JsonAsync();
        Assert.Equal(JsonValueKind.Null, updated.GetProperty("description").ValueKind);
        Assert.Equal(JsonValueKind.Null, updated.GetProperty("startDate").ValueKind);
        Assert.Equal(JsonValueKind.Null, updated.GetProperty("dueDate").ValueKind);
    }

    [Theory]
    [InlineData("""{ "title": "x", "status": "Todo" }""", "priority")]            // missing priority must NOT silently become Low
    [InlineData("""{ "title": "x", "priority": "High" }""", "status")]            // missing status must NOT silently become Todo
    [InlineData("""{ "title": " ", "priority": "High", "status": "Todo" }""", "title")]
    [InlineData("""{ "title": "x", "priority": "High", "status": "Todo", "startDate": "2030-01-02T00:00:00Z", "dueDate": "2030-01-01T00:00:00Z" }""", "startDate")]
    [InlineData("""{ "title": "x", "priority": "Nope", "status": "Todo" }""", "priority")]
    public async Task Invalid_put_is_400_and_leaves_the_task_untouched(string json, string field)
    {
        var user = await _api.RegisterAsync();
        var original = await user.CreateTaskAsync(new { title = "Giữ nguyên", priority = "High", status = "InProgress" });
        var id = original.GetProperty("id").GetGuid();

        var response = await user.Client.PutAsync($"/api/tasks/{id}", new StringContent(json, Encoding.UTF8, "application/json"));

        Assert.NotEmpty((await response.ReadProblemAsync(400)).ErrorsFor(field));
        Assert.Equal(original.GetRawText(), (await user.GetJsonAsync($"/api/tasks/{id}")).GetRawText());
    }

    [Fact]
    public async Task Put_on_an_unknown_id_is_404()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.PutAsJsonAsync($"/api/tasks/{Guid.NewGuid()}", new { title = "x", priority = "Low", status = "Todo" });

        await response.ReadProblemAsync(404);
    }

    // --- Status (PATCH) --------------------------------------------------------------------------

    [Theory]
    [InlineData("Todo", "InProgress")]
    [InlineData("InProgress", "Completed")]
    [InlineData("Completed", "Todo")]        // re-opening is allowed (BR-08)
    [InlineData("Todo", "Completed")]
    [InlineData("Completed", "InProgress")]
    public async Task Patch_status_allows_any_transition_and_changes_nothing_else(string from, string to)
    {
        var user = await _api.RegisterAsync();
        var original = await user.CreateTaskAsync(new { title = "Chuyển trạng thái", description = "d", priority = "High", status = from, dueDate = DateTimeOffset.UtcNow.AddDays(5) });
        var id = original.GetProperty("id").GetGuid();

        var response = await user.Client.PatchAsJsonAsync($"/api/tasks/{id}/status", new { status = to });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.JsonAsync();
        Assert.Equal(to, updated.GetProperty("status").GetString());
        Assert.Equal(original.GetProperty("title").GetString(), updated.GetProperty("title").GetString());
        Assert.Equal(original.GetProperty("description").GetString(), updated.GetProperty("description").GetString());
        Assert.Equal(original.GetProperty("priority").GetString(), updated.GetProperty("priority").GetString());
        Assert.Equal(original.GetProperty("dueDate").GetDateTimeOffset(), updated.GetProperty("dueDate").GetDateTimeOffset());
        Assert.True(updated.GetProperty("updatedAt").GetDateTimeOffset() > original.GetProperty("updatedAt").GetDateTimeOffset());
        Assert.Equal(to, (await user.GetJsonAsync($"/api/tasks/{id}")).GetProperty("status").GetString());
    }

    [Theory]
    [InlineData("""{ }""")]
    [InlineData("""{ "status": null }""")]
    [InlineData("""{ "status": "Finished" }""")]
    [InlineData("""{ "status": 1 }""")]
    public async Task Patch_status_with_a_missing_or_invalid_value_is_400_and_changes_nothing(string json)
    {
        var user = await _api.RegisterAsync();
        var original = await user.CreateTaskAsync(new { title = "x", status = "InProgress" });
        var id = original.GetProperty("id").GetGuid();

        var response = await user.Client.PatchAsync($"/api/tasks/{id}/status", new StringContent(json, Encoding.UTF8, "application/json"));

        Assert.NotEmpty((await response.ReadProblemAsync(400)).ErrorsFor("status"));
        Assert.Equal("InProgress", (await user.GetJsonAsync($"/api/tasks/{id}")).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Patch_status_on_an_unknown_id_is_404()
    {
        var user = await _api.RegisterAsync();

        await (await user.Client.PatchAsJsonAsync($"/api/tasks/{Guid.NewGuid()}/status", new { status = "Completed" })).ReadProblemAsync(404);
    }

    [Fact]
    public async Task Completing_an_overdue_task_clears_the_overdue_flag_and_reopening_restores_it()
    {
        var user = await _api.RegisterAsync();
        var task = await user.CreateTaskAsync(new { title = "Trễ", dueDate = DateTimeOffset.UtcNow.AddDays(-1) });
        var id = task.GetProperty("id").GetGuid();
        Assert.True(task.GetProperty("isOverdue").GetBoolean());

        var done = await (await user.Client.PatchAsJsonAsync($"/api/tasks/{id}/status", new { status = "Completed" })).JsonAsync();
        var reopened = await (await user.Client.PatchAsJsonAsync($"/api/tasks/{id}/status", new { status = "Todo" })).JsonAsync();

        Assert.False(done.GetProperty("isOverdue").GetBoolean());
        Assert.True(reopened.GetProperty("isOverdue").GetBoolean());
    }

    // --- Delete ----------------------------------------------------------------------------------

    [Fact]
    public async Task Delete_removes_only_the_requested_task()
    {
        var user = await _api.RegisterAsync();
        var doomed = (await user.CreateTaskAsync("Sẽ xóa")).GetProperty("id").GetGuid();
        var kept = (await user.CreateTaskAsync("Giữ lại")).GetProperty("id").GetGuid();

        var response = await user.Client.DeleteAsync($"/api/tasks/{doomed}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await user.Client.GetAsync($"/api/tasks/{doomed}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await user.Client.GetAsync($"/api/tasks/{kept}")).StatusCode);
        Assert.Equal(1, await CountAsync(user));
    }

    [Fact]
    public async Task Deleting_twice_or_deleting_an_unknown_id_is_404()
    {
        var user = await _api.RegisterAsync();
        var id = (await user.CreateTaskAsync("x")).GetProperty("id").GetGuid();
        await user.Client.DeleteAsync($"/api/tasks/{id}");

        await (await user.Client.DeleteAsync($"/api/tasks/{id}")).ReadProblemAsync(404);
        await (await user.Client.DeleteAsync($"/api/tasks/{Guid.NewGuid()}")).ReadProblemAsync(404);
    }
}
