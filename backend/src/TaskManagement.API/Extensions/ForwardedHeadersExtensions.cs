using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace TaskManagement.API.Extensions;

public static class ForwardedHeadersExtensions
{
    /// <summary>
    /// Behind a reverse proxy the socket address is the proxy's, so the per-IP login limiter (ADR-12) would put every
    /// user in one bucket. Trusting X-Forwarded-For from anyone would instead let a client pick its own bucket, hence
    /// this is off by default and only honours headers sent by the proxies/networks listed in configuration.
    /// </summary>
    public static IServiceCollection AddConfiguredForwardedHeaders(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection("ForwardedHeaders");
        if (!section.GetValue("Enabled", false))
        {
            return services;
        }

        var proxies = section.GetSection("KnownProxies").Get<string[]>() ?? [];
        var networks = section.GetSection("KnownNetworks").Get<string[]>() ?? [];
        if (proxies.Length == 0 && networks.Length == 0)
        {
            throw new InvalidOperationException(
                "ForwardedHeaders:Enabled requires ForwardedHeaders:KnownProxies or ForwardedHeaders:KnownNetworks; " +
                "trusting forwarded headers from any caller would let clients spoof their IP.");
        }

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.KnownProxies.Clear();
            options.KnownIPNetworks.Clear();
            foreach (var proxy in proxies)
            {
                options.KnownProxies.Add(IPAddress.Parse(proxy));
            }

            foreach (var network in networks)
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
            }
        });

        services.AddSingleton<ForwardedHeadersMarker>();
        return services;
    }

    public static IApplicationBuilder UseConfiguredForwardedHeaders(this WebApplication app)
    {
        if (app.Services.GetService<ForwardedHeadersMarker>() is not null)
        {
            app.UseForwardedHeaders();
        }

        return app;
    }

    private sealed class ForwardedHeadersMarker;
}
