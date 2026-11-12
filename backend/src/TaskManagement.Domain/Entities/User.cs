using TaskManagement.Domain.Exceptions;

namespace TaskManagement.Domain.Entities;

public sealed class User
{
    public const int FullNameMaxLength = 150;
    public const int EmailMaxLength = 255;

    public Guid Id { get; private set; }
    public string FullName { get; private set; } = string.Empty;
    public string Email { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    private User() { }

    /// <summary>Single place where emails are normalised (AC-01), so lookups and storage always agree.</summary>
    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public static User Create(string fullName, string email, string passwordHash, DateTimeOffset now)
    {
        var user = new User
        {
            Id = Guid.CreateVersion7(),
            PasswordHash = RequireHash(passwordHash),
            CreatedAt = now.ToUniversalTime(),
            UpdatedAt = now.ToUniversalTime(),
        };
        user.FullName = ValidateFullName(fullName);
        user.Email = ValidateEmail(email);
        return user;
    }

    public void UpdateProfile(string fullName, string email, DateTimeOffset now)
    {
        FullName = ValidateFullName(fullName);
        Email = ValidateEmail(email);
        UpdatedAt = now.ToUniversalTime();
    }

    public void ChangePasswordHash(string passwordHash, DateTimeOffset now)
    {
        PasswordHash = RequireHash(passwordHash);
        UpdatedAt = now.ToUniversalTime();
    }

    private static string ValidateFullName(string fullName)
    {
        var value = fullName?.Trim() ?? string.Empty;
        if (value.Length is 0 or > FullNameMaxLength)
        {
            throw new DomainException($"Họ tên phải từ 1 đến {FullNameMaxLength} ký tự.", "fullName");
        }
        return value;
    }

    private static string ValidateEmail(string email)
    {
        var value = NormalizeEmail(email ?? string.Empty);
        if (value.Length is 0 or > EmailMaxLength)
        {
            throw new DomainException($"Email phải từ 1 đến {EmailMaxLength} ký tự.", "email");
        }
        return value;
    }

    private static string RequireHash(string hash) =>
        string.IsNullOrWhiteSpace(hash) ? throw new DomainException("Mật khẩu không hợp lệ.", "password") : hash;
}
