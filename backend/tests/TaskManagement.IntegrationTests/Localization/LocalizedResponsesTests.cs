using System.Net;
using System.Net.Http.Json;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Localization;

[Collection(PostgresCollection.Name)]
public sealed class LocalizedResponsesTests : IDisposable
{
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public LocalizedResponsesTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private static readonly string?[] VietnameseOrUnsupported = [null, "vi-VN,vi;q=0.9", "fr-FR"];

    private HttpClient Client(string? language)
    {
        var client = _factory.CreateClient();
        if (language is not null)
        {
            client.DefaultRequestHeaders.AcceptLanguage.ParseAdd(language);
        }

        return client;
    }

    [Fact]
    public async Task A_wrong_password_is_reported_in_english_when_the_client_asks_for_english()
    {
        var user = await _api.RegisterAsync();

        var response = await Client("en-US,en;q=0.9").PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = "Wr0ngPassword" });
        var problem = await response.ReadProblemAsync(401);

        Assert.Equal("Incorrect email or password.", problem.GetProperty("detail").GetString());
        Assert.Equal("Not signed in", problem.GetProperty("title").GetString());
        Assert.Equal("en", response.Content.Headers.ContentLanguage.Single());
        Assert.Contains("Accept-Language", response.Headers.Vary);
    }

    [Fact]
    public async Task The_same_error_stays_vietnamese_without_the_header_or_for_vietnamese()
    {
        var user = await _api.RegisterAsync();

        foreach (var language in VietnameseOrUnsupported)
        {
            var response = await Client(language).PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = "Wr0ngPassword" });
            var problem = await response.ReadProblemAsync(401);

            Assert.Equal("Email hoặc mật khẩu không đúng.", problem.GetProperty("detail").GetString());
            Assert.Equal("Chưa đăng nhập", problem.GetProperty("title").GetString());
        }
    }

    [Fact]
    public async Task Field_errors_are_translated_per_field_with_their_numbers()
    {
        var response = await Client("en").PostAsJsonAsync("/api/auth/register", new { fullName = "  ", email = "not-an-email", password = "short" });
        var problem = await response.ReadProblemAsync(400);

        Assert.Equal("Invalid data", problem.GetProperty("title").GetString());
        Assert.Equal("One or more fields are not valid.", problem.GetProperty("detail").GetString());
        Assert.Contains("Full name cannot be empty.", problem.ErrorsFor("fullName"));
        Assert.Contains("This email address is not valid.", problem.ErrorsFor("email"));
        Assert.Contains("The password needs at least 8 characters.", problem.ErrorsFor("password"));
    }

    [Fact]
    public async Task A_duplicate_email_conflict_is_translated_in_detail_and_field()
    {
        var user = await _api.RegisterAsync();

        var response = await Client("en").PostAsJsonAsync("/api/auth/register", new { fullName = "An", email = user.Email, password = "Passw0rd1" });
        var problem = await response.ReadProblemAsync(409);

        Assert.Equal("This email is already in use.", problem.GetProperty("detail").GetString());
        Assert.Equal(["This email is already in use."], problem.ErrorsFor("email"));
    }

    [Fact]
    public async Task A_missing_task_is_reported_in_english()
    {
        var user = await _api.RegisterAsync();
        user.Client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en");

        var problem = await (await user.Client.GetAsync($"/api/tasks/{Guid.NewGuid()}")).ReadProblemAsync(404);

        Assert.Equal("Task not found.", problem.GetProperty("detail").GetString());
        Assert.Equal("Not found", problem.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Model_binding_errors_and_a_missing_token_are_translated_too()
    {
        var client = Client("en");

        var malformed = await client.PostAsync("/api/auth/login", new StringContent("{ not json", System.Text.Encoding.UTF8, "application/json"));
        var malformedProblem = await malformed.ReadProblemAsync(400);
        Assert.Equal("Invalid data", malformedProblem.GetProperty("title").GetString());

        var unauthenticated = await client.GetAsync("/api/tasks");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthenticated.StatusCode);
        Assert.Equal("Not signed in", (await unauthenticated.ReadProblemAsync(401)).GetProperty("title").GetString());
    }

    [Fact]
    public async Task Rate_limit_rejections_are_translated()
    {
        using var limited = _factory.WithWebHostBuilder(b => b.UseSetting("RateLimiting:AuthPermitPerMinute", "1"));
        var client = limited.CreateClient();
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en");
        await client.PostAsJsonAsync("/api/auth/login", new { email = "a@b.co", password = "x" });

        var problem = await (await client.PostAsJsonAsync("/api/auth/login", new { email = "a@b.co", password = "x" })).ReadProblemAsync(429);

        Assert.Equal("Too many requests", problem.GetProperty("title").GetString());
    }
}
