using Microsoft.EntityFrameworkCore;
using TaskManagement.Domain.Entities;

namespace TaskManagement.Application.Abstractions;

/// <summary>
/// Data access port. Application code queries through LINQ on these sets; Infrastructure supplies the EF Core implementation (ADR-02).
/// </summary>
public interface IAppDbContext
{
    DbSet<User> Users { get; }
    DbSet<TaskItem> Tasks { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
