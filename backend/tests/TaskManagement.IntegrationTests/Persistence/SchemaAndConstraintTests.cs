using Microsoft.EntityFrameworkCore;
using Npgsql;
using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;
using TaskManagement.IntegrationTests.Infrastructure;
using TaskManagement.Infrastructure.Persistence;

namespace TaskManagement.IntegrationTests.Persistence;

[Collection(PostgresCollection.Name)]
public sealed class SchemaAndConstraintTests(PostgresFixture postgres)
{
    private static readonly DateTimeOffset Now = new(2026, 11, 12, 9, 0, 0, TimeSpan.Zero);

    private AppDbContext NewContext() => postgres.CreateContext();

    private static User NewUser(string? email = null) =>
        User.Create("An", email ?? $"{Guid.NewGuid():N}@example.com", "hash", Now);

    private async Task<User> SaveUserAsync()
    {
        await using var db = NewContext();
        var user = NewUser();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static string Sqlstate(Exception ex) => Pg(ex).SqlState;

    private static PostgresException Pg(Exception ex)
    {
        for (var e = ex; e is not null; e = e.InnerException)
        {
            if (e is PostgresException pg)
            {
                return pg;
            }
        }
        throw new InvalidOperationException("No PostgresException found.", ex);
    }

    // --- Migration vs model ----------------------------------------------------------------------

    [Fact]
    public async Task All_migrations_are_applied_and_the_model_has_no_unmigrated_changes()
    {
        await using var db = NewContext();

        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.False(db.Database.HasPendingModelChanges(), "The EF model differs from the migrations; add a migration.");
    }

    // --- Schema as documented in docs/database/schema.md -----------------------------------------

    [Fact]
    public async Task Expected_indexes_exist_and_recent_first_indexes_are_descending()
    {
        await using var db = NewContext();

        var defs = await db.Database
            .SqlQuery<string>($"SELECT indexdef AS \"Value\" FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('Tasks','Users')")
            .ToListAsync();

        Assert.Contains(defs, d => d.Contains("UX_Users_Email", StringComparison.Ordinal) && d.Contains("UNIQUE", StringComparison.Ordinal));
        Assert.Contains(defs, d => d.Contains("IX_Tasks_UserId_CreatedAt", StringComparison.Ordinal) && d.Contains("\"CreatedAt\" DESC", StringComparison.Ordinal));
        Assert.Contains(defs, d => d.Contains("IX_Tasks_UserId_UpdatedAt", StringComparison.Ordinal) && d.Contains("\"UpdatedAt\" DESC", StringComparison.Ordinal));
        Assert.Contains(defs, d => d.Contains("IX_Tasks_UserId_DueDate", StringComparison.Ordinal));
        Assert.Contains(defs, d => d.Contains("IX_Tasks_UserId_Status", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Column_types_match_the_design()
    {
        await using var db = NewContext();

        var columns = await db.Database
            .SqlQuery<string>($"""
                SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS "Value"
                FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('Tasks','Users')
                """)
            .ToListAsync();

        Assert.Contains("Tasks.Id:uuid:NO", columns);
        Assert.Contains("Tasks.Title:character varying:NO", columns);
        Assert.Contains("Tasks.Description:text:YES", columns);
        Assert.Contains("Tasks.Status:integer:NO", columns);
        Assert.Contains("Tasks.Priority:integer:NO", columns);
        Assert.Contains("Tasks.StartDate:timestamp with time zone:YES", columns);
        Assert.Contains("Tasks.DueDate:timestamp with time zone:YES", columns);
        Assert.Contains("Tasks.CreatedAt:timestamp with time zone:NO", columns);
        Assert.Contains("Users.Email:character varying:NO", columns);
        Assert.Contains("Users.PasswordHash:text:NO", columns);
    }

    [Fact]
    public async Task Foreign_key_from_tasks_to_users_cascades_on_delete()
    {
        await using var db = NewContext();

        var rule = await db.Database
            .SqlQuery<string>($"SELECT delete_rule AS \"Value\" FROM information_schema.referential_constraints WHERE constraint_name = 'FK_Tasks_Users_UserId'")
            .SingleAsync();

        Assert.Equal("CASCADE", rule);
    }

    // --- Round trip ------------------------------------------------------------------------------

    [Fact]
    public async Task Task_round_trips_every_field()
    {
        var user = await SaveUserAsync();
        var task = TaskItem.Create(user.Id, "Viết báo cáo", "Mô tả dài\nnhiều dòng", TaskPriority.High, TaskItemStatus.InProgress, Now, Now.AddDays(3), Now);
        await using (var db = NewContext())
        {
            db.Tasks.Add(task);
            await db.SaveChangesAsync();
        }

        await using var read = NewContext();
        var loaded = await read.Tasks.AsNoTracking().SingleAsync(t => t.Id == task.Id);

        Assert.Equal(user.Id, loaded.UserId);
        Assert.Equal("Viết báo cáo", loaded.Title);
        Assert.Equal("Mô tả dài\nnhiều dòng", loaded.Description);
        Assert.Equal(TaskPriority.High, loaded.Priority);
        Assert.Equal(TaskItemStatus.InProgress, loaded.Status);
        Assert.Equal(Now, loaded.StartDate);
        Assert.Equal(Now.AddDays(3), loaded.DueDate);
        Assert.Equal(Now, loaded.CreatedAt);
        Assert.Equal(Now, loaded.UpdatedAt);
    }

    [Fact]
    public async Task Optional_fields_persist_as_null()
    {
        var user = await SaveUserAsync();
        var task = TaskItem.Create(user.Id, "Tối giản", null, null, null, null, null, Now);
        await using (var db = NewContext())
        {
            db.Tasks.Add(task);
            await db.SaveChangesAsync();
        }

        await using var read = NewContext();
        var loaded = await read.Tasks.AsNoTracking().SingleAsync(t => t.Id == task.Id);

        Assert.Null(loaded.Description);
        Assert.Null(loaded.StartDate);
        Assert.Null(loaded.DueDate);
        Assert.Equal(TaskItemStatus.Todo, loaded.Status);
        Assert.Equal(TaskPriority.Medium, loaded.Priority);
    }

    [Fact]
    public async Task Instants_with_a_local_offset_are_stored_as_the_same_utc_instant()
    {
        var user = await SaveUserAsync();
        var local = new DateTimeOffset(2026, 12, 1, 23, 30, 0, TimeSpan.FromHours(7));
        var task = TaskItem.Create(user.Id, "Múi giờ", null, null, null, null, local, Now);
        await using (var db = NewContext())
        {
            db.Tasks.Add(task);
            await db.SaveChangesAsync();
        }

        await using var read = NewContext();
        var loaded = await read.Tasks.AsNoTracking().SingleAsync(t => t.Id == task.Id);

        Assert.Equal(local, loaded.DueDate);
        Assert.Equal(TimeSpan.Zero, loaded.DueDate!.Value.Offset);
        Assert.Equal(new DateTimeOffset(2026, 12, 1, 16, 30, 0, TimeSpan.Zero), loaded.DueDate);
    }

    [Fact]
    public async Task Enums_are_stored_as_the_documented_integers()
    {
        var user = await SaveUserAsync();
        var task = TaskItem.Create(user.Id, "Enum", null, TaskPriority.High, TaskItemStatus.Completed, null, null, Now);
        await using var db = NewContext();
        db.Tasks.Add(task);
        await db.SaveChangesAsync();

        var stored = await db.Database
            .SqlQuery<string>($"SELECT \"Status\" || ',' || \"Priority\" AS \"Value\" FROM \"Tasks\" WHERE \"Id\" = {task.Id}")
            .SingleAsync();

        Assert.Equal("2,2", stored);
    }

    [Fact]
    public async Task Update_and_status_change_are_persisted()
    {
        var user = await SaveUserAsync();
        var task = TaskItem.Create(user.Id, "Cũ", null, null, null, null, null, Now);
        await using (var db = NewContext())
        {
            db.Tasks.Add(task);
            await db.SaveChangesAsync();
        }

        await using (var db = NewContext())
        {
            var tracked = await db.Tasks.SingleAsync(t => t.Id == task.Id);
            tracked.Update("Mới", "mô tả", TaskPriority.Low, TaskItemStatus.InProgress, null, Now.AddDays(1), Now.AddHours(1));
            tracked.ChangeStatus(TaskItemStatus.Completed, Now.AddHours(2));
            await db.SaveChangesAsync();
        }

        await using var read = NewContext();
        var loaded = await read.Tasks.AsNoTracking().SingleAsync(t => t.Id == task.Id);
        Assert.Equal("Mới", loaded.Title);
        Assert.Equal(TaskItemStatus.Completed, loaded.Status);
        Assert.Equal(Now.AddHours(2), loaded.UpdatedAt);
        Assert.Equal(Now, loaded.CreatedAt);
    }

    // --- Users -----------------------------------------------------------------------------------

    [Fact]
    public async Task Duplicate_email_is_rejected_by_the_unique_index()
    {
        var email = $"{Guid.NewGuid():N}@example.com";
        await using (var db = NewContext())
        {
            db.Users.Add(NewUser(email));
            await db.SaveChangesAsync();
        }

        await using var second = NewContext();
        second.Users.Add(NewUser(email));
        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => second.SaveChangesAsync());

        Assert.Equal(PostgresErrorCodes.UniqueViolation, Sqlstate(ex));
        Assert.Equal("UX_Users_Email", Pg(ex).ConstraintName);
    }

    [Fact]
    public async Task Emails_differing_only_by_case_or_padding_collide_because_they_are_normalised()
    {
        var local = Guid.NewGuid().ToString("N");
        await using (var db = NewContext())
        {
            db.Users.Add(NewUser($"{local}@Example.COM"));
            await db.SaveChangesAsync();
        }

        await using var second = NewContext();
        second.Users.Add(NewUser($"  {local}@example.com "));
        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => second.SaveChangesAsync());

        Assert.Equal(PostgresErrorCodes.UniqueViolation, Sqlstate(ex));
    }

    [Fact]
    public async Task Deleting_a_user_deletes_only_that_users_tasks()
    {
        var doomed = await SaveUserAsync();
        var survivor = await SaveUserAsync();
        await using (var db = NewContext())
        {
            db.Tasks.AddRange(
                TaskItem.Create(doomed.Id, "a", null, null, null, null, null, Now),
                TaskItem.Create(doomed.Id, "b", null, null, null, null, null, Now),
                TaskItem.Create(survivor.Id, "c", null, null, null, null, null, Now));
            await db.SaveChangesAsync();
        }

        await using (var db = NewContext())
        {
            await db.Users.Where(u => u.Id == doomed.Id).ExecuteDeleteAsync();
        }

        await using var read = NewContext();
        Assert.Equal(0, await read.Tasks.CountAsync(t => t.UserId == doomed.Id));
        Assert.Equal(1, await read.Tasks.CountAsync(t => t.UserId == survivor.Id));
    }

    // --- Database-level safety net (bypassing the Domain on purpose) -----------------------------

    [Fact]
    public async Task Database_rejects_a_task_for_a_missing_user()
    {
        await using var db = NewContext();

        var ex = await Assert.ThrowsAsync<PostgresException>(() => InsertRaw(db, Guid.NewGuid(), "x", 0, 1, null, null));

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ex.SqlState);
    }

    [Theory]
    [InlineData(3, 1, "CK_Tasks_Status")]
    [InlineData(-1, 1, "CK_Tasks_Status")]
    [InlineData(0, 3, "CK_Tasks_Priority")]
    [InlineData(0, -1, "CK_Tasks_Priority")]
    public async Task Database_rejects_out_of_range_enum_values(int status, int priority, string constraint)
    {
        var user = await SaveUserAsync();
        await using var db = NewContext();

        var ex = await Assert.ThrowsAsync<PostgresException>(() => InsertRaw(db, user.Id, "x", status, priority, null, null));

        Assert.Equal(PostgresErrorCodes.CheckViolation, ex.SqlState);
        Assert.Equal(constraint, ex.ConstraintName);
    }

    [Fact]
    public async Task Database_rejects_start_after_due_but_allows_equal_and_partial_dates()
    {
        var user = await SaveUserAsync();
        await using var db = NewContext();

        var ex = await Assert.ThrowsAsync<PostgresException>(() => InsertRaw(db, user.Id, "x", 0, 1, Now.AddSeconds(1), Now));
        Assert.Equal("CK_Tasks_StartDate_LE_DueDate", ex.ConstraintName);

        Assert.Equal(1, await InsertRaw(db, user.Id, "equal", 0, 1, Now, Now));
        Assert.Equal(1, await InsertRaw(db, user.Id, "only start", 0, 1, Now, null));
        Assert.Equal(1, await InsertRaw(db, user.Id, "only due", 0, 1, null, Now));
    }

    [Fact]
    public async Task Database_rejects_a_title_longer_than_200_characters()
    {
        var user = await SaveUserAsync();
        await using var db = NewContext();

        var ex = await Assert.ThrowsAsync<PostgresException>(() => InsertRaw(db, user.Id, new string('a', 201), 0, 1, null, null));

        Assert.Equal(PostgresErrorCodes.StringDataRightTruncation, ex.SqlState);
        Assert.Equal(1, await InsertRaw(db, user.Id, new string('a', 200), 0, 1, null, null));
    }

    private static Task<int> InsertRaw(AppDbContext db, Guid userId, string title, int status, int priority, DateTimeOffset? start, DateTimeOffset? due) =>
        db.Database.ExecuteSqlAsync($"""
            INSERT INTO "Tasks" ("Id","UserId","Title","Status","Priority","StartDate","DueDate","CreatedAt","UpdatedAt")
            VALUES ({Guid.NewGuid()}, {userId}, {title}, {status}, {priority}, {start}, {due}, {Now}, {Now})
            """);
}
