using TaskManagement.Domain.Entities;

namespace TaskManagement.Application.Abstractions;

public sealed record AccessToken(string Value, DateTimeOffset ExpiresAt);

public interface IJwtTokenService
{
    AccessToken Create(User user);

    /// <summary>How long a refresh token stays valid after it was issued (each use issues a new one, so activity extends it).</summary>
    TimeSpan RefreshLifetime { get; }
}
