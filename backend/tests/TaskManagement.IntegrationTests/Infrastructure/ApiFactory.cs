using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TaskManagement.Infrastructure.Persistence;

namespace TaskManagement.IntegrationTests.Infrastructure;

/// <summary>Boots the real API against the Testcontainers database. Secrets here are throwaway test values.</summary>
public sealed class ApiFactory(string connectionString, string environment = "Development", TimeProvider? clock = null) : WebApplicationFactory<Program>
{
    public const string JwtKey = "integration-tests-only-signing-key-0123456789-abcdef";
    public const string Issuer = "TaskFlow.Tests";
    public const string Audience = "TaskFlow.Tests.Client";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.UseSetting("ConnectionStrings:DefaultConnection", connectionString);
        builder.UseSetting("Jwt:Key", JwtKey);
        builder.UseSetting("Jwt:Issuer", Issuer);
        builder.UseSetting("Jwt:Audience", Audience);
        builder.UseSetting("Jwt:ExpiresMinutes", "60");

        // Tests register many users from one address; the limiter has its own dedicated tests that lower this.
        builder.UseSetting("RateLimiting:AuthPermitPerMinute", "100000");

        // Lets the pipeline be exercised before real endpoints exist; see PipelineProbeController.
        builder.ConfigureServices(services =>
        {
            services.AddControllers().AddApplicationPart(typeof(PipelineProbeController).Assembly);

            if (clock is not null)
            {
                services.RemoveAll<TimeProvider>();
                services.AddSingleton(clock);
            }
        });
    }

    public async Task MigrateAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    }
}
