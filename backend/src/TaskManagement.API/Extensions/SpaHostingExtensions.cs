using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Net.Http.Headers;

namespace TaskManagement.API.Extensions;

/// <summary>
/// Lets the API serve the Angular build from the same origin as /api (ADR-15) when no separate web server exists, as in
/// the packaged desktop app. Off by default: behind nginx the web container does this job.
/// </summary>
public static class SpaHostingExtensions
{
    // Same policy nginx sends in the Docker setup; tokens live in localStorage so the CSP is the main XSS mitigation.
    private const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

    private static string? SpaRoot(IConfiguration configuration)
    {
        if (!configuration.GetValue("Hosting:ServeSpa", false))
        {
            return null;
        }

        var root = configuration["Hosting:SpaRoot"];
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
        {
            throw new InvalidOperationException("Hosting:ServeSpa requires Hosting:SpaRoot to be an existing folder containing the web build.");
        }

        return Path.GetFullPath(root);
    }

    private static StaticFileOptions Options(PhysicalFileProvider files)
    {
        var contentTypes = new FileExtensionContentTypeProvider();
        contentTypes.Mappings[".webmanifest"] = "application/manifest+json";
        return new StaticFileOptions
        {
            FileProvider = files,
            ContentTypeProvider = contentTypes,
            OnPrepareResponse = context =>
            {
                var name = context.File.Name;
                var shell = name.Equals("index.html", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".webmanifest", StringComparison.OrdinalIgnoreCase);
                // Hashed bundles never change; the page that references them must always be revalidated.
                context.Context.Response.Headers.CacheControl = shell ? "no-cache" : "public, max-age=31536000, immutable";
            },
        };
    }

    /// <summary>
    /// Must come before UseRouting: once routing has picked an endpoint (the SPA fallback matches every path), the static
    /// file middleware steps aside, so real files like main.js would be answered with index.html.
    /// </summary>
    public static IApplicationBuilder UseConfiguredSpaFiles(this WebApplication app)
    {
        var root = SpaRoot(app.Configuration);
        if (root is null)
        {
            return app;
        }

        app.Use((context, next) =>
        {
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                headers[HeaderNames.ContentSecurityPolicy] = ContentSecurityPolicy;
                headers[HeaderNames.XContentTypeOptions] = "nosniff";
                headers["Referrer-Policy"] = "same-origin";
                return Task.CompletedTask;
            });
            return next();
        });
        var files = new PhysicalFileProvider(root);
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
        app.UseStaticFiles(Options(files));
        return app;
    }

    /// <summary>Client-side routes (/tasks, /schedule...) get index.html. Anything under /api stays a real API 404 (problem+json).</summary>
    public static IEndpointRouteBuilder MapConfiguredSpaFallback(this WebApplication app)
    {
        var root = SpaRoot(app.Configuration);
        if (root is not null)
        {
            app.MapFallbackToFile("{**path:regex(^(?!api(/|$)).*$)}", "index.html", Options(new PhysicalFileProvider(root))).AllowAnonymous();
        }

        return app;
    }
}
