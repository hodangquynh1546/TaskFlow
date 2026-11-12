using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Pipeline;

[Collection(PostgresCollection.Name)]
public sealed class ForwardedHeadersTests(PostgresFixture postgres)
{
    private const string ProxyIp = "10.0.0.7";

    private WebApplicationFactory<Program> Build(Action<IWebHostBuilder> configure, string socketIp = ProxyIp) =>
        new ApiFactory(postgres.ConnectionString).WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimiting:AuthPermitPerMinute", "2");
            // TestServer has no socket, so give each request the address a real proxy connection would have.
            b.ConfigureServices(services => services.AddTransient<IStartupFilter>(_ => new FakeSocketFilter(IPAddress.Parse(socketIp))));
            configure(b);
        });

    private static async Task<HttpStatusCode> LoginAs(HttpClient client, string? forwardedFor)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/test/limited");
        if (forwardedFor is not null)
        {
            request.Headers.Add("X-Forwarded-For", forwardedFor);
        }

        return (await client.SendAsync(request)).StatusCode;
    }

    [Fact]
    public async Task Trusted_proxy_gives_each_forwarded_client_its_own_rate_limit_budget()
    {
        using var factory = Build(b =>
        {
            b.UseSetting("ForwardedHeaders:Enabled", "true");
            b.UseSetting("ForwardedHeaders:KnownProxies:0", ProxyIp);
        });
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, await LoginAs(client, "203.0.113.1"));
        Assert.Equal(HttpStatusCode.OK, await LoginAs(client, "203.0.113.1"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginAs(client, "203.0.113.1"));
        Assert.Equal(HttpStatusCode.OK, await LoginAs(client, "203.0.113.2"));
    }

    [Fact]
    public async Task Trusted_network_is_accepted_like_a_listed_proxy()
    {
        using var factory = Build(b =>
        {
            b.UseSetting("ForwardedHeaders:Enabled", "true");
            b.UseSetting("ForwardedHeaders:KnownNetworks:0", "10.0.0.0/8");
        });
        using var client = factory.CreateClient();

        await LoginAs(client, "203.0.113.1");
        await LoginAs(client, "203.0.113.1");
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginAs(client, "203.0.113.1"));
        Assert.Equal(HttpStatusCode.OK, await LoginAs(client, "203.0.113.2"));
    }

    [Fact]
    public async Task Forwarded_header_from_an_untrusted_caller_cannot_dodge_the_limit()
    {
        using var factory = Build(b =>
        {
            b.UseSetting("ForwardedHeaders:Enabled", "true");
            b.UseSetting("ForwardedHeaders:KnownProxies:0", "10.9.9.9");
        });
        using var client = factory.CreateClient();

        await LoginAs(client, "203.0.113.1");
        await LoginAs(client, "203.0.113.2");
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginAs(client, "203.0.113.3"));
    }

    [Fact]
    public async Task Forwarded_headers_are_ignored_unless_enabled()
    {
        using var factory = Build(_ => { });
        using var client = factory.CreateClient();

        await LoginAs(client, "203.0.113.1");
        await LoginAs(client, "203.0.113.2");
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginAs(client, "203.0.113.3"));
    }

    [Fact]
    public void Enabling_without_any_trusted_proxy_fails_fast()
    {
        using var factory = Build(b => b.UseSetting("ForwardedHeaders:Enabled", "true"));

        Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
    }

    private sealed class FakeSocketFilter(IPAddress address) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((context, nextMiddleware) =>
            {
                context.Connection.RemoteIpAddress = address;
                return nextMiddleware();
            });
            next(app);
        };
    }
}
