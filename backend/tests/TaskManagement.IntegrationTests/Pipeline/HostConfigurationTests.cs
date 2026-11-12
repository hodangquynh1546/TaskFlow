using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Pipeline;

[Collection(PostgresCollection.Name)]
public sealed class HostConfigurationTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Rate_limit_returns_429_problem_after_the_configured_number_of_requests()
    {
        using var factory = new ApiFactory(postgres.ConnectionString)
            .WithWebHostBuilder(b => b.UseSetting("RateLimiting:AuthPermitPerMinute", "3"));
        using var client = factory.CreateClient();

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/test/limited", null)).StatusCode);
        }
        var limited = await client.PostAsync("/test/limited", null);

        var problem = await limited.ReadProblemAsync(429);
        Assert.Equal("Quá nhiều yêu cầu", problem.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Rate_limit_does_not_affect_endpoints_without_the_policy()
    {
        using var factory = new ApiFactory(postgres.ConnectionString)
            .WithWebHostBuilder(b => b.UseSetting("RateLimiting:AuthPermitPerMinute", "1"));
        using var client = factory.CreateClient();

        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/test/public")).StatusCode);
        }
    }

    [Fact]
    public async Task Cors_allows_the_configured_frontend_origin_only()
    {
        using var factory = new ApiFactory(postgres.ConnectionString);
        using var client = factory.CreateClient();

        var allowed = await Preflight(client, "http://localhost:4200");
        var denied = await Preflight(client, "https://evil.example");

        Assert.Equal("http://localhost:4200", allowed.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.False(denied.Headers.Contains("Access-Control-Allow-Origin"));
    }

    private static Task<HttpResponseMessage> Preflight(HttpClient client, string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/anything");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");
        return client.SendAsync(request);
    }

    [Fact]
    public async Task Swagger_is_served_in_development_and_documents_bearer_auth()
    {
        using var factory = new ApiFactory(postgres.ConnectionString, "Development");
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/swagger/v1/swagger.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var doc = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("bearer", doc.GetProperty("components").GetProperty("securitySchemes").GetProperty("Bearer").GetProperty("scheme").GetString());
    }

    [Fact]
    public async Task Swagger_is_not_exposed_outside_development()
    {
        using var factory = new ApiFactory(postgres.ConnectionString, "Production");
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/swagger/v1/swagger.json");

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public void Startup_fails_fast_when_the_signing_key_is_too_short()
    {
        using var factory = new ApiFactory(postgres.ConnectionString)
            .WithWebHostBuilder(b => b.UseSetting("Jwt:Key", "too-short"));

        var error = Record.Exception(() => factory.CreateClient());

        Assert.Contains("Jwt:Key", Flatten(error), StringComparison.Ordinal);
    }

    [Fact]
    public void Startup_fails_fast_when_the_connection_string_is_missing()
    {
        using var factory = new ApiFactory(postgres.ConnectionString)
            .WithWebHostBuilder(b => b.UseSetting("ConnectionStrings:DefaultConnection", ""));

        var error = Record.Exception(() => factory.CreateClient());

        Assert.Contains("ConnectionStrings:DefaultConnection", Flatten(error), StringComparison.Ordinal);
    }

    private static string Flatten(Exception? ex)
    {
        Assert.NotNull(ex);
        var parts = new List<string>();
        for (var e = ex; e is not null; e = e.InnerException)
        {
            parts.Add(e.Message);
        }
        return string.Join(" | ", parts);
    }
}
