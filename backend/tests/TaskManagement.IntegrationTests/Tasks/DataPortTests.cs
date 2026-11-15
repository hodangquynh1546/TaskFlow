using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using TaskManagement.Domain.Enums;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Tasks;

/// <summary>Taking a user's tasks out as a file and bringing a file in.</summary>
[Collection(PostgresCollection.Name)]
public sealed class DataPortTests : IDisposable
{
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public DataPortTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private static readonly DateTimeOffset Start = new(2030, 5, 1, 8, 0, 0, TimeSpan.Zero);

    private static Task<HttpResponseMessage> Import(TestUser user, string format, string content) =>
        user.Client.PostAsJsonAsync("/api/data/import", new { format, content });

    private static async Task<JsonElement> ImportOk(TestUser user, string format, string content)
    {
        var response = await Import(user, format, content);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task<string[]> Titles(TestUser user) =>
        (await user.GetJsonAsync("/api/tasks?pageSize=50&sortBy=createdAt&sortDir=asc")).GetProperty("items").EnumerateArray().Select(i => i.GetProperty("title").GetString()!).ToArray();

    // --- Export ----------------------------------------------------------------------------------

    [Fact]
    public async Task Json_export_is_a_download_with_every_task_and_nothing_private()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "Một", TaskItemStatus.InProgress, TaskPriority.High, start: Start, due: Start.AddMinutes(60), durationMinutes: 60);
        await _api.SeedTaskAsync(user.Id, "Hai");

        var response = await user.Client.GetAsync("/api/data/export?format=json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType!.MediaType);
        Assert.Matches(@"^taskflow-\d{8}-\d{4}\.json$", response.Content.Headers.ContentDisposition!.FileName!);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("TaskFlow", body.GetProperty("app").GetString());
        Assert.Equal(1, body.GetProperty("version").GetInt32());
        var tasks = body.GetProperty("tasks").EnumerateArray().ToList();
        Assert.Equal(["Một", "Hai"], tasks.Select(t => t.GetProperty("title").GetString()!).ToArray());
        Assert.Equal("InProgress", tasks[0].GetProperty("status").GetString());
        Assert.Equal(60, tasks[0].GetProperty("durationMinutes").GetInt32());
        var raw = body.GetRawText();
        Assert.DoesNotContain(user.Email, raw, StringComparison.Ordinal);
        Assert.DoesNotContain(user.Id.ToString(), raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Csv_export_starts_with_a_byte_order_mark_so_Excel_reads_Vietnamese()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "đã dạy, \"học\"");

        var response = await user.Client.GetAsync("/api/data/export?format=csv");

        Assert.Equal("text/csv", response.Content.Headers.ContentType!.MediaType);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal([0xEF, 0xBB, 0xBF], bytes.Take(3).ToArray());
        var text = Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        Assert.StartsWith("title,description,status,priority", text, StringComparison.Ordinal);
        Assert.Contains("\"đã dạy, \"\"học\"\"\"", text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Only_the_users_own_tasks_are_exported()
    {
        var mine = await _api.RegisterAsync();
        var theirs = await _api.RegisterAsync();
        await _api.SeedTaskAsync(mine.Id, "của tôi");
        await _api.SeedTaskAsync(theirs.Id, "của người khác");

        var body = await mine.GetJsonAsync("/api/data/export?format=json");

        Assert.Equal(["của tôi"], body.GetProperty("tasks").EnumerateArray().Select(t => t.GetProperty("title").GetString()!).ToArray());
    }

    [Fact]
    public async Task An_unknown_export_format_is_a_400()
    {
        var user = await _api.RegisterAsync();

        await (await user.Client.GetAsync("/api/data/export?format=xml")).ReadProblemAsync(400);
    }

    // --- Import ----------------------------------------------------------------------------------

    [Fact]
    public async Task What_one_account_exports_another_can_import_and_get_the_same_tasks_back()
    {
        var from = await _api.RegisterAsync();
        await _api.SeedTaskAsync(from.Id, "Họp", TaskItemStatus.InProgress, TaskPriority.High, start: Start, due: Start.AddMinutes(30), durationMinutes: 30, created: Start.AddDays(-5));
        await _api.SeedTaskAsync(from.Id, "Việc không giờ", TaskItemStatus.Completed);
        var to = await _api.RegisterAsync();

        foreach (var format in new[] { "json", "csv" })
        {
            var export = await from.Client.GetAsync($"/api/data/export?format={format}");
            var text = Encoding.UTF8.GetString(await export.Content.ReadAsByteArrayAsync()).TrimStart('﻿');

            var result = await ImportOk(to, format, text);
            Assert.Equal(format == "json" ? 2 : 0, result.GetProperty("imported").GetInt32());
            if (format == "json")
            {
                var tasks = (await to.GetJsonAsync("/api/tasks?pageSize=50&sortBy=startDate&sortDir=asc")).GetProperty("items").EnumerateArray().ToList();
                var meeting = tasks.Single(t => t.GetProperty("title").GetString() == "Họp");
                Assert.Equal("InProgress", meeting.GetProperty("status").GetString());
                Assert.Equal("High", meeting.GetProperty("priority").GetString());
                Assert.Equal(Start, meeting.GetProperty("startDate").GetDateTimeOffset());
                Assert.Equal(30, meeting.GetProperty("durationMinutes").GetInt32());
                Assert.Equal(Start.AddMinutes(30), meeting.GetProperty("dueDate").GetDateTimeOffset());
                Assert.Equal("Completed", tasks.Single(t => t.GetProperty("title").GetString() == "Việc không giờ").GetProperty("status").GetString());
            }
            else
            {
                // The same file a second way round: every task is already there, so nothing is added twice.
                Assert.Equal(2, result.GetProperty("duplicates").GetInt32());
            }
        }

        Assert.Equal(2, (await Titles(to)).Length);
    }

    [Fact]
    public async Task A_repeat_survives_export_and_import_in_both_formats()
    {
        var from = await _api.RegisterAsync();
        await _api.SeedTaskAsync(from.Id, "Tập thể dục", start: Start, durationMinutes: 30,
            recurrence: new TaskManagement.Domain.Entities.Recurrence(RecurrenceFrequency.Weekly, 2, 1 | 4, Start.AddDays(60), 420));

        foreach (var format in new[] { "json", "csv" })
        {
            var to = await _api.RegisterAsync();
            var export = await from.Client.GetAsync($"/api/data/export?format={format}");
            await ImportOk(to, format, Encoding.UTF8.GetString(await export.Content.ReadAsByteArrayAsync()).TrimStart('\uFEFF'));

            var repeat = (await to.GetJsonAsync("/api/tasks")).GetProperty("items")[0].GetProperty("recurrence");
            Assert.Equal("Weekly", repeat.GetProperty("frequency").GetString());
            Assert.Equal(2, repeat.GetProperty("interval").GetInt32());
            Assert.Equal(5, repeat.GetProperty("weekdays").GetInt32());
            Assert.Equal(420, repeat.GetProperty("utcOffsetMinutes").GetInt32());
            Assert.Equal(Start.AddDays(60), repeat.GetProperty("until").GetDateTimeOffset());
        }
    }

    [Fact]
    public async Task A_bad_repeat_in_a_csv_row_is_reported_on_that_row()
    {
        var user = await _api.RegisterAsync();
        var csv = "title,startDate,repeat,repeatEvery\r\n" +
                  "Tốt,2030-05-01T08:00:00Z,Daily,2\r\n" +        // 2
                  "Sai kiểu,2030-05-01T08:00:00Z,Hourly,\r\n" +    // 3
                  "Sai số,2030-05-01T08:00:00Z,Daily,hai\r\n" +    // 4
                  "Không giờ,,Daily,\r\n" +                        // 5: a repeat needs a start time
                  "Quá lớn,2030-05-01T08:00:00Z,Daily,500\r\n";    // 6

        var result = await ImportOk(user, "csv", csv);

        Assert.Equal(1, result.GetProperty("imported").GetInt32());
        var fields = result.GetProperty("errors").EnumerateArray().ToDictionary(e => e.GetProperty("row").GetInt32(), e => e.GetProperty("field").GetString());
        Assert.Equal(new Dictionary<int, string?> { [3] = "repeat", [4] = "repeatEvery", [5] = "recurrence", [6] = "recurrence.interval" }, fields);
    }

    [Fact]
    public async Task Importing_the_same_file_twice_adds_nothing_the_second_time()
    {
        var user = await _api.RegisterAsync();
        const string file = "title,startDate\r\nA,2030-05-01T08:00:00Z\r\nB,\r\n";

        var first = await ImportOk(user, "csv", file);
        var second = await ImportOk(user, "csv", file);

        Assert.Equal(2, first.GetProperty("imported").GetInt32());
        Assert.Equal(0, second.GetProperty("imported").GetInt32());
        Assert.Equal(2, second.GetProperty("duplicates").GetInt32());
        Assert.Equal(2, (await Titles(user)).Length);
    }

    [Fact]
    public async Task The_same_title_at_a_different_time_is_a_different_task()
    {
        var user = await _api.RegisterAsync();

        var result = await ImportOk(user, "csv", "title,startDate\r\nHọp,2030-05-01T08:00:00Z\r\nHọp,2030-05-02T08:00:00Z\r\nhọp,2030-05-02T08:00:00Z\r\n");

        Assert.Equal(2, result.GetProperty("imported").GetInt32());
        Assert.Equal(1, result.GetProperty("duplicates").GetInt32());
    }

    [Fact]
    public async Task A_bad_row_is_reported_with_its_row_number_and_the_good_rows_are_still_imported()
    {
        var user = await _api.RegisterAsync();
        var csv = "title,status,priority,startDate,durationMinutes\r\n" +
                  "Tốt,Todo,Low,,\r\n" +                // row 2: fine
                  ",Todo,Low,,\r\n" +                    // row 3: no title
                  "Sai trạng thái,Finished,Low,,\r\n" +  // row 4
                  "Sai ưu tiên,Todo,Urgent,,\r\n" +      // row 5
                  "Sai ngày,Todo,Low,hôm qua,\r\n" +     // row 6
                  "Sai giờ,Todo,Low,,hai tiếng\r\n" +    // row 7
                  "Thời lượng quá lớn,Todo,Low,,5000\r\n" + // row 8
                  "Tốt hai,,,,\r\n";                     // row 9: defaults apply

        var result = await ImportOk(user, "csv", csv);

        Assert.Equal(2, result.GetProperty("imported").GetInt32());
        Assert.Equal(6, result.GetProperty("failed").GetInt32());
        var errors = result.GetProperty("errors").EnumerateArray().Select(e => (e.GetProperty("row").GetInt32(), e.GetProperty("field").GetString())).ToArray();
        Assert.Equal([(3, "title"), (4, "status"), (5, "priority"), (6, "startDate"), (7, "durationMinutes"), (8, "durationMinutes")], errors.OrderBy(e => e.Item1).ToArray());
        Assert.Equal(["Tốt", "Tốt hai"], (await Titles(user)).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Missing_status_and_priority_fall_back_to_the_defaults()
    {
        var user = await _api.RegisterAsync();

        await ImportOk(user, "json", """{ "tasks": [ { "title": "Chỉ có tiêu đề" } ] }""");

        var task = (await user.GetJsonAsync("/api/tasks")).GetProperty("items")[0];
        Assert.Equal("Todo", task.GetProperty("status").GetString());
        Assert.Equal("Medium", task.GetProperty("priority").GetString());
    }

    [Fact]
    public async Task A_bare_list_of_tasks_is_accepted_as_json_and_names_match_in_any_case()
    {
        var user = await _api.RegisterAsync();

        var result = await ImportOk(user, "JSON", """[ { "Title": "Một", "status": "completed", "PRIORITY": "high" } ]""");

        Assert.Equal(1, result.GetProperty("imported").GetInt32());
        var task = (await user.GetJsonAsync("/api/tasks")).GetProperty("items")[0];
        Assert.Equal("Completed", task.GetProperty("status").GetString());
        Assert.Equal("High", task.GetProperty("priority").GetString());
    }

    [Fact]
    public async Task A_due_date_in_the_file_is_ignored_for_a_scheduled_task_because_the_block_decides_it()
    {
        var user = await _api.RegisterAsync();

        await ImportOk(user, "json", """{ "tasks": [ { "title": "Có giờ", "startDate": "2030-05-01T08:00:00Z", "durationMinutes": 45, "dueDate": "2031-01-01T00:00:00Z" } ] }""");

        var task = (await user.GetJsonAsync("/api/tasks")).GetProperty("items")[0];
        Assert.Equal(Start.AddMinutes(45), task.GetProperty("dueDate").GetDateTimeOffset());
    }

    [Fact]
    public async Task An_imported_task_belongs_to_the_importer_and_a_file_cannot_claim_another_owner()
    {
        var mine = await _api.RegisterAsync();
        var theirs = await _api.RegisterAsync();

        await ImportOk(mine, "json", $$"""{ "tasks": [ { "title": "Của tôi", "userId": "{{theirs.Id}}" } ] }""");

        Assert.Equal(["Của tôi"], await Titles(mine));
        Assert.Empty(await Titles(theirs));
    }

    [Theory]
    [InlineData("json", "không phải json")]
    [InlineData("json", """{ "khong": "co tasks" }""")]
    [InlineData("json", """{ "tasks": "không phải danh sách" }""")]
    [InlineData("csv", "a,b\r\n1,2\r\n")]
    [InlineData("xml", "<a/>")]
    public async Task A_file_that_cannot_be_read_is_a_400_and_imports_nothing(string format, string content)
    {
        var user = await _api.RegisterAsync();

        await (await Import(user, format, content)).ReadProblemAsync(400);

        Assert.Empty(await Titles(user));
    }

    [Fact]
    public async Task Too_many_tasks_in_one_file_is_refused_whole()
    {
        var user = await _api.RegisterAsync();
        var csv = "title\r\n" + string.Concat(Enumerable.Range(0, 2001).Select(i => $"Việc {i}\r\n"));

        await (await Import(user, "csv", csv)).ReadProblemAsync(400);

        Assert.Empty(await Titles(user));
    }

    [Fact]
    public async Task A_huge_file_is_refused_before_it_is_read()
    {
        var user = await _api.RegisterAsync();

        await (await Import(user, "csv", "title\r\n" + new string('x', 5_000_001))).ReadProblemAsync(400);
    }

    [Fact]
    public async Task Row_errors_and_problems_are_in_the_language_of_the_reader()
    {
        var user = await _api.RegisterAsync();
        user.Client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("ja");

        var result = await ImportOk(user, "csv", "title,status\r\nA,Finished\r\n");
        await (await Import(user, "csv", "a,b\r\n1,2\r\n")).ReadProblemAsync(400);

        Assert.Equal("ステータスが正しくありません。", result.GetProperty("errors")[0].GetProperty("message").GetString());
    }

    [Fact]
    public async Task Signing_in_is_required()
    {
        var anonymous = _api.Anonymous();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/data/export")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/data/import", new { format = "json", content = "[]" })).StatusCode);
    }
}
