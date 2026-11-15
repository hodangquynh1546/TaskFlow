using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskManagement.Domain.Entities;

namespace TaskManagement.Infrastructure.Persistence.Configurations;

internal sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.ToTable("Tasks", table =>
        {
            // Second line of defence; the rules themselves live in the Domain (see docs/database/schema.md).
            table.HasCheckConstraint("CK_Tasks_Status", "\"Status\" IN (0, 1, 2)");
            table.HasCheckConstraint("CK_Tasks_Priority", "\"Priority\" IN (0, 1, 2)");
            table.HasCheckConstraint("CK_Tasks_DurationMinutes", "\"DurationMinutes\" IS NULL OR \"DurationMinutes\" BETWEEN 1 AND 1440");
            table.HasCheckConstraint(
                "CK_Tasks_StartDate_LE_DueDate",
                "\"StartDate\" IS NULL OR \"DueDate\" IS NULL OR \"StartDate\" <= \"DueDate\"");
        });

        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).ValueGeneratedNever();

        builder.Property(t => t.UserId).IsRequired();
        builder.Property(t => t.Title).IsRequired().HasMaxLength(TaskItem.TitleMaxLength);
        builder.Property(t => t.Description).HasColumnType("text");
        builder.Property(t => t.Status).IsRequired().HasConversion<int>();
        builder.Property(t => t.Priority).IsRequired().HasConversion<int>();
        builder.Property(t => t.StartDate);
        builder.Property(t => t.RecurrenceSpawned).IsRequired().HasDefaultValue(false);
        // No repeat is no row values at all (all five columns null); a repeat fills them.
        builder.OwnsOne(t => t.Recurrence, r =>
        {
            r.Property(x => x.Frequency).HasColumnName("RecurrenceFrequency").HasConversion<int>();
            r.Property(x => x.Interval).HasColumnName("RecurrenceInterval");
            r.Property(x => x.Weekdays).HasColumnName("RecurrenceWeekdays");
            r.Property(x => x.Until).HasColumnName("RecurrenceUntil");
            r.Property(x => x.UtcOffsetMinutes).HasColumnName("RecurrenceUtcOffsetMinutes");
        });
        builder.Property(t => t.DueDate);
        builder.Property(t => t.DurationMinutes);
        builder.Property(t => t.CreatedAt).IsRequired();
        builder.Property(t => t.UpdatedAt).IsRequired();

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every query filters by UserId first, so every index starts with it (this also covers the FK).
        builder.HasIndex(t => new { t.UserId, t.CreatedAt }).IsDescending(false, true).HasDatabaseName("IX_Tasks_UserId_CreatedAt");
        builder.HasIndex(t => new { t.UserId, t.DueDate }).HasDatabaseName("IX_Tasks_UserId_DueDate");
        builder.HasIndex(t => new { t.UserId, t.StartDate }).HasDatabaseName("IX_Tasks_UserId_StartDate");
        builder.HasIndex(t => new { t.UserId, t.Status }).HasDatabaseName("IX_Tasks_UserId_Status");
        builder.HasIndex(t => new { t.UserId, t.UpdatedAt }).IsDescending(false, true).HasDatabaseName("IX_Tasks_UserId_UpdatedAt");
    }
}
