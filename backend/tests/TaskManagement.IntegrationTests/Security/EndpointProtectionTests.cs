using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Security;

/// <summary>Discovers every real endpoint at run time, so a newly added endpoint is covered automatically.</summary>
[Collection(PostgresCollection.Name)]
public sealed class EndpointProtectionTests(PostgresFixture postgres) : IDisposable
{
    private static readonly string[] PublicEndpoints = ["POST api/auth/login", "POST api/auth/register"];

    private readonly ApiFactory _factory = new(postgres.ConnectionString);

    public void Dispose() => _factory.Dispose();

    private IEnumerable<(string Method, string Pattern, RouteEndpoint Endpoint)> ApiEndpoints() =>
        _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText!.StartsWith("api/", StringComparison.Ordinal))
            .SelectMany(e => (e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? []).Select(m => (m, e.RoutePattern.RawText!, e)));

    [Fact]
    public void The_full_api_surface_is_present()
    {
        var all = ApiEndpoints().Select(e => $"{e.Method} {e.Pattern}").Order().ToArray();

        Assert.Equal(
            [
                "DELETE api/tasks/{id:guid}",
                "GET api/auth/me",
                "GET api/dashboard/recent-tasks",
                "GET api/dashboard/report",
                "GET api/dashboard/summary",
                "GET api/dashboard/upcoming-tasks",
                "GET api/tasks",
                "GET api/tasks/{id:guid}",
                "GET api/users/profile",
                "PATCH api/tasks/{id:guid}/status",
                "POST api/auth/change-password",
                "POST api/auth/login",
                "POST api/auth/logout",
                "POST api/auth/register",
                "POST api/tasks",
                "PUT api/tasks/{id:guid}",
                "PUT api/users/profile",
            ],
            all);
    }

    [Fact]
    public void Only_login_and_register_are_marked_anonymous()
    {
        var anonymous = ApiEndpoints()
            .Where(e => e.Endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            .Select(e => $"{e.Method} {e.Pattern}")
            .Order();

        Assert.Equal(PublicEndpoints, anonymous);
    }

    [Fact]
    public async Task Every_other_endpoint_answers_401_without_a_token()
    {
        using var client = _factory.CreateClient();
        var protectedEndpoints = ApiEndpoints().Where(e => !PublicEndpoints.Contains($"{e.Method} {e.Pattern}")).ToList();
        Assert.Equal(15, protectedEndpoints.Count);

        foreach (var (method, pattern, _) in protectedEndpoints)
        {
            var url = "/" + System.Text.RegularExpressions.Regex.Replace(pattern, @"\{id[^}]*\}", Guid.NewGuid().ToString());
            using var request = new HttpRequestMessage(new HttpMethod(method), url);
            if (method is "POST" or "PUT" or "PATCH")
            {
                request.Content = JsonContent.Create(new { });
            }

            var response = await client.SendAsync(request);

            Assert.True(response.StatusCode == HttpStatusCode.Unauthorized, $"{method} {pattern} returned {(int)response.StatusCode} without a token");
        }
    }

    [Fact]
    public async Task Every_protected_endpoint_rejects_a_forged_token_too()
    {
        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Bearer", TestTokens.Create(Guid.NewGuid().ToString(), key: "attacker-chosen-signing-key-0123456789-abcdef"));

        foreach (var (method, pattern, _) in ApiEndpoints().Where(e => !PublicEndpoints.Contains($"{e.Method} {e.Pattern}")))
        {
            var url = "/" + System.Text.RegularExpressions.Regex.Replace(pattern, @"\{id[^}]*\}", Guid.NewGuid().ToString());
            using var request = new HttpRequestMessage(new HttpMethod(method), url);
            if (method is "POST" or "PUT" or "PATCH")
            {
                request.Content = JsonContent.Create(new { });
            }

            Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
        }
    }
}
