using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Pipeline;

[Collection(PostgresCollection.Name)]
public sealed class ErrorHandlingTests : IDisposable
{
    private readonly CapturingLoggerProvider _logs = new();
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public ErrorHandlingTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString);
        _client = _factory.WithWebHostBuilder(b => b.ConfigureServices(s => s.AddLogging(l => l.AddProvider(_logs)))).CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task DomainException_with_field_is_400_with_error_under_that_field()
    {
        var problem = await (await _client.GetAsync("/test/throw/domain")).ReadProblemAsync(400);

        Assert.Equal("Dữ liệu không hợp lệ", problem.GetProperty("title").GetString());
        Assert.Equal(["Ngày bắt đầu không được sau hạn hoàn thành."], problem.ErrorsFor("startDate"));
    }

    [Fact]
    public async Task DomainException_without_field_is_400_with_message_and_no_errors_map()
    {
        var problem = await (await _client.GetAsync("/test/throw/domain-nofield")).ReadProblemAsync(400);

        Assert.Equal("Vi phạm quy tắc.", problem.GetProperty("detail").GetString());
        Assert.False(problem.TryGetProperty("errors", out _));
    }

    [Fact]
    public async Task Fluent_validation_errors_are_grouped_by_camelCase_field()
    {
        var problem = await (await _client.GetAsync("/test/throw/validation")).ReadProblemAsync(400);

        Assert.Equal(["Tiêu đề không được để trống.", "Tiêu đề quá dài."], problem.ErrorsFor("title"));
        Assert.Equal(["Hạn hoàn thành không hợp lệ."], problem.ErrorsFor("dueDate"));
    }

    [Fact]
    public async Task NotFound_is_404()
    {
        var problem = await (await _client.GetAsync("/test/throw/notfound")).ReadProblemAsync(404);

        Assert.Equal("Không tìm thấy công việc.", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Conflict_is_409_with_field_error()
    {
        var problem = await (await _client.GetAsync("/test/throw/conflict")).ReadProblemAsync(409);

        Assert.Equal(["Email đã được sử dụng."], problem.ErrorsFor("email"));
    }

    [Fact]
    public async Task Application_unauthorized_is_401()
    {
        var problem = await (await _client.GetAsync("/test/throw/unauthorized")).ReadProblemAsync(401);

        Assert.Equal("Email hoặc mật khẩu không đúng.", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Unexpected_exception_is_500_without_leaking_details_and_is_logged_as_error()
    {
        var response = await _client.GetAsync("/test/throw/boom");

        var problem = await response.ReadProblemAsync(500);
        var raw = problem.GetRawText();
        Assert.DoesNotContain("SECRET-INTERNAL-DETAIL", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("hunter2", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("InvalidOperationException", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("   at ", raw, StringComparison.Ordinal);
        Assert.Equal("Lỗi máy chủ", problem.GetProperty("title").GetString());

        Assert.Contains(_logs.Entries, e =>
            e.Level == LogLevel.Error && e.Exception is InvalidOperationException && e.Message.Contains("/test/throw/boom", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Expected_client_errors_are_not_logged_as_errors()
    {
        await _client.GetAsync("/test/throw/notfound");
        await _client.GetAsync("/test/throw/validation");

        Assert.DoesNotContain(_logs.Entries, e => e.Level >= LogLevel.Error);
    }

    [Fact]
    public async Task Error_responses_include_trace_id_that_differs_per_request()
    {
        var a = await (await _client.GetAsync("/test/throw/notfound")).ReadProblemAsync(404);
        var b = await (await _client.GetAsync("/test/throw/notfound")).ReadProblemAsync(404);

        Assert.NotEqual(a.GetProperty("traceId").GetString(), b.GetProperty("traceId").GetString());
    }

    [Fact]
    public async Task Valid_body_round_trips_and_enums_are_serialised_as_strings()
    {
        var response = await _client.PostAsJsonAsync("/test/body", new { priority = "High", count = 3 });

        Assert.True(response.StatusCode == HttpStatusCode.OK,
            string.Join("\n", _logs.Entries.Where(e => e.Level >= LogLevel.Error).Select(e => e.Message + " :: " + e.Exception)));
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("High", body.GetProperty("priority").GetString());
        Assert.Equal(3, body.GetProperty("count").GetInt32());
    }

    [Theory]
    [InlineData("""{ "priority": "Urgent", "count": 3 }""", "priority")]
    [InlineData("""{ "priority": 1, "count": 3 }""", "priority")] // numbers are not accepted for enums
    [InlineData("""{ "priority": "High", "count": "many" }""", "count")]
    [InlineData("""{ "priority": "High", "count": 99 }""", "count")]
    public async Task Bad_field_values_are_400_with_error_keyed_by_the_json_field_name(string json, string field)
    {
        var response = await _client.PostAsync("/test/body", new StringContent(json, Encoding.UTF8, "application/json"));

        var problem = await response.ReadProblemAsync(400);
        Assert.NotEmpty(problem.ErrorsFor(field));
    }

    [Fact]
    public async Task Malformed_json_is_400_problem_not_500()
    {
        var response = await _client.PostAsync("/test/body", new StringContent("{ nope", Encoding.UTF8, "application/json"));

        await response.ReadProblemAsync(400);
    }

    [Fact]
    public async Task Client_supplied_error_text_never_contains_framework_english_for_binding_failures()
    {
        var response = await _client.PostAsync("/test/body", new StringContent("""{ "priority": "Urgent", "count": 3 }""", Encoding.UTF8, "application/json"));

        var problem = await response.ReadProblemAsync(400);
        Assert.Equal(["Giá trị không hợp lệ."], problem.ErrorsFor("priority"));
    }
}
