using Microsoft.EntityFrameworkCore;
using TaskManagement.Infrastructure.Persistence;

namespace TaskManagement.API.Hosting;

public static partial class DatabaseMigrator
{
    /// <summary>Applies every pending migration; safe to run repeatedly. Failures propagate so the process exits non-zero.</summary>
    public static async Task MigrateAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DatabaseMigrator));
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var pending = (await context.Database.GetPendingMigrationsAsync(cancellationToken)).Count();
        await context.Database.MigrateAsync(cancellationToken);
        LogMigrated(logger, pending);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Database is up to date ({Pending} migrations applied now).")]
    private static partial void LogMigrated(ILogger logger, int pending);
}
