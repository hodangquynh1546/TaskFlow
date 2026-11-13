namespace TaskManagement.API.Hosting;

/// <summary>
/// The API normally just serves requests. The packaged desktop app also needs it to apply database migrations on
/// demand (<c>TaskManagement.API migrate</c>) because it has no tooling to run them. The server never migrates on its
/// own (docs/architecture/deployment.md), so this is opt-in and explicit.
/// </summary>
public static class StartupMode
{
    public const string MigrateCommand = "migrate";

    public static bool IsMigrateOnly(string[] args) =>
        args.Length > 0 && string.Equals(args[0], MigrateCommand, StringComparison.OrdinalIgnoreCase);

    /// <summary>The arguments the host builder should see: the command word is not a configuration switch.</summary>
    public static string[] WithoutCommand(string[] args) => IsMigrateOnly(args) ? args[1..] : args;
}
