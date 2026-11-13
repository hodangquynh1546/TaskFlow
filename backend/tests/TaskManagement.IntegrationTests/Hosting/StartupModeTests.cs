using Npgsql;
using TaskManagement.API.Hosting;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Hosting;

[Collection(PostgresCollection.Name)]
public sealed class StartupModeTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData(new[] { "migrate" }, true)]
    [InlineData(new[] { "MIGRATE", "--urls=http://x" }, true)]
    [InlineData(new string[0], false)]
    [InlineData(new[] { "--urls=http://x", "migrate" }, false)]
    [InlineData(new[] { "migration" }, false)]
    public void Only_a_leading_migrate_word_selects_migrate_mode(string[] args, bool expected)
    {
        Assert.Equal(expected, StartupMode.IsMigrateOnly(args));
    }

    [Fact]
    public void The_command_word_is_not_passed_on_as_a_configuration_switch()
    {
        Assert.Equal(["--urls=http://x"], StartupMode.WithoutCommand(["migrate", "--urls=http://x"]));
        Assert.Equal(["--urls=http://x"], StartupMode.WithoutCommand(["--urls=http://x"]));
    }

    [Fact]
    public async Task Migrate_builds_the_schema_in_an_empty_database_and_can_run_again()
    {
        var name = $"fresh_{Guid.NewGuid():N}";
        await using (var admin = new NpgsqlConnection(postgres.ConnectionString))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE {name}", admin);
            await create.ExecuteNonQueryAsync();
        }

        var connection = new NpgsqlConnectionStringBuilder(postgres.ConnectionString) { Database = name }.ConnectionString;
        using var factory = new ApiFactory(connection);
        await DatabaseMigrator.MigrateAsync(factory.Services);
        await DatabaseMigrator.MigrateAsync(factory.Services); // idempotent

        await using var check = new NpgsqlConnection(connection);
        await check.OpenAsync();
        await using var count = new NpgsqlCommand("SELECT count(*) FROM information_schema.tables WHERE table_name IN ('Users','Tasks')", check);
        Assert.Equal(2L, await count.ExecuteScalarAsync());
    }
}
