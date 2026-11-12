using TaskManagement.Domain.Entities;

namespace TaskManagement.Application.Auth;

public sealed record RegisterRequest(string FullName, string Email, string Password);

public sealed record LoginRequest(string Email, string Password);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

/// <summary>Never carries the password hash (AC-04).</summary>
public sealed record UserDto(Guid Id, string FullName, string Email, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt)
{
    public static UserDto From(User user) => new(user.Id, user.FullName, user.Email, user.CreatedAt, user.UpdatedAt);
}

public sealed record AuthResponse(string AccessToken, DateTimeOffset ExpiresAt, UserDto User);
