using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskManagement.Domain.Entities;

namespace TaskManagement.Infrastructure.Persistence.Configurations;

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("RefreshTokens");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).ValueGeneratedNever();

        // SHA-256 as hex.
        builder.Property(t => t.TokenHash).IsRequired().HasMaxLength(64);
        builder.Property(t => t.CreatedAt).IsRequired();
        builder.Property(t => t.ExpiresAt).IsRequired();

        builder.HasIndex(t => t.TokenHash).IsUnique().HasDatabaseName("UX_RefreshTokens_TokenHash");
        builder.HasIndex(t => t.UserId).HasDatabaseName("IX_RefreshTokens_UserId");
        builder.HasIndex(t => t.FamilyId).HasDatabaseName("IX_RefreshTokens_FamilyId");

        builder.HasOne<User>().WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
