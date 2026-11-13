using System.Net;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Hosting;

[Collection(PostgresCollection.Name)]
public sealed class SpaHostingTests(PostgresFixture postgres) : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("taskflow-spa-").FullName;

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private HttpClient Client(bool serve = true, string? root = null)
    {
        File.WriteAllText(Path.Combine(_root, "index.html"), "<html><title>TaskFlow shell</title></html>");
        File.WriteAllText(Path.Combine(_root, "main-ABC12345.js"), "console.log('app');");
        File.WriteAllText(Path.Combine(_root, "manifest.webmanifest"), "{\"name\":\"TaskFlow\"}");

        var factory = new ApiFactory(postgres.ConnectionString).WithWebHostBuilder(b =>
        {
            b.UseSetting("Hosting:ServeSpa", serve ? "true" : "false");
            b.UseSetting("Hosting:SpaRoot", root ?? _root);
        });
        return factory.CreateClient();
    }

    [Fact]
    public async Task Serves_the_page_at_the_root_and_for_client_side_routes()
    {
        using var client = Client();

        foreach (var path in new[] { "/", "/index.html", "/tasks", "/tasks/0198-abc/edit", "/schedule" })
        {
            var response = await client.GetAsync(path);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Contains("TaskFlow shell", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task An_unknown_api_path_is_still_a_json_404_never_the_page()
    {
        using var client = Client();

        var response = await client.GetAsync("/api/does-not-exist");

        // Signed out, the app's fallback policy answers 401 for any unknown path; either way it is JSON, never the page.
        Assert.True(response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Unauthorized);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("TaskFlow shell", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Api_and_health_endpoints_keep_working_next_to_the_page()
    {
        using var client = Client();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/tasks")).StatusCode);
    }

    [Fact]
    public async Task The_shell_is_revalidated_but_hashed_bundles_are_cached_for_good()
    {
        using var client = Client();

        var shell = await client.GetAsync("/");
        var bundle = await client.GetAsync("/main-ABC12345.js");

        Assert.Equal("no-cache", shell.Headers.CacheControl?.ToString());
        Assert.Contains("immutable", bundle.Headers.CacheControl?.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Pages_carry_the_strict_content_security_policy()
    {
        using var client = Client();

        var response = await client.GetAsync("/");

        var csp = response.Headers.GetValues("Content-Security-Policy").Single();
        Assert.Contains("script-src 'self'", csp, StringComparison.Ordinal);
        Assert.Contains("frame-ancestors 'none'", csp, StringComparison.Ordinal);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Fact]
    public async Task The_install_manifest_has_its_own_content_type()
    {
        using var client = Client();

        var response = await client.GetAsync("/manifest.webmanifest");

        Assert.Equal("application/manifest+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Is_off_by_default_so_the_server_setup_behind_nginx_is_unchanged()
    {
        using var client = Client(serve: false);

        var response = await client.GetAsync("/");

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEqual("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public void Turning_it_on_without_a_valid_folder_stops_the_server_from_starting()
    {
        // The host is built when the client is created, so that is where it must refuse to start.
        var failure = Assert.ThrowsAny<Exception>(() => Client(root: Path.Combine(_root, "missing")));

        Assert.Contains("Hosting:SpaRoot", failure.ToString(), StringComparison.Ordinal);
    }
}
