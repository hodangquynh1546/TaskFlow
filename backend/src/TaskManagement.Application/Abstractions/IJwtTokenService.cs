using TaskManagement.Domain.Entities;

namespace TaskManagement.Application.Abstractions;

public sealed record AccessToken(string Value, DateTimeOffset ExpiresAt);

public interface IJwtTokenService
{
    AccessToken Create(User user);
}
