using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskManagement.Application.Abstractions;
using TaskManagement.Application.Common;
using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.Application.Auth;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken);

    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken);

    Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken);
}

internal sealed partial class AuthService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IPasswordHasher hasher,
    IJwtTokenService tokens,
    TimeProvider clock,
    IValidator<RegisterRequest> registerValidator,
    IValidator<LoginRequest> loginValidator,
    IValidator<ChangePasswordRequest> changePasswordValidator,
    ILogger<AuthService> logger) : IAuthService
{
    private const string InvalidCredentials = "Email hoặc mật khẩu không đúng.";

    // Verified against when the email is unknown, so "no such user" costs the same time as "wrong password" (AC-07).
    private static string? _decoyHash;

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken)
    {
        var normalized = request with { Email = User.NormalizeEmail(request.Email ?? string.Empty) };
        await registerValidator.ValidateAndThrowAsync(normalized, cancellationToken);

        if (await EmailExistsAsync(normalized.Email, null, cancellationToken))
        {
            throw EmailTaken();
        }

        var user = User.Create(normalized.FullName, normalized.Email, hasher.Hash(normalized.Password), clock.GetUtcNow());
        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // If someone else now owns the email we lost a race with a concurrent registration; the unique index is the
            // final arbiter. Anything else is a genuine failure and must not be disguised as a conflict.
            if (await EmailExistsAsync(normalized.Email, user.Id, cancellationToken))
            {
                throw EmailTaken();
            }
            throw;
        }

        LogRegistered(user.Id);
        return Issue(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        await loginValidator.ValidateAndThrowAsync(request, cancellationToken);

        var email = User.NormalizeEmail(request.Email);
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email, cancellationToken);

        var valid = hasher.Verify(user?.PasswordHash ?? DecoyHash(), request.Password) && user is not null;
        if (!valid)
        {
            LogLoginFailed();
            throw new UnauthorizedException(InvalidCredentials);
        }

        return Issue(user!);
    }

    public async Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        await changePasswordValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new UnauthorizedException("Tài khoản không còn tồn tại.");

        if (!hasher.Verify(user.PasswordHash, request.CurrentPassword))
        {
            throw new DomainException("Mật khẩu hiện tại không đúng.", "currentPassword");
        }
        if (request.NewPassword == request.CurrentPassword)
        {
            throw new DomainException("Mật khẩu mới phải khác mật khẩu hiện tại.", "newPassword");
        }

        user.ChangePasswordHash(hasher.Hash(request.NewPassword), clock.GetUtcNow());
        await db.SaveChangesAsync(cancellationToken);
        LogPasswordChanged(user.Id);
    }

    private AuthResponse Issue(User user)
    {
        var token = tokens.Create(user);
        return new AuthResponse(token.Value, token.ExpiresAt, UserDto.From(user));
    }

    private Task<bool> EmailExistsAsync(string email, Guid? exceptUserId, CancellationToken cancellationToken) =>
        db.Users.AsNoTracking().AnyAsync(u => u.Email == email && u.Id != exceptUserId, cancellationToken);

    private string DecoyHash() =>
        LazyInitializer.EnsureInitialized(ref _decoyHash, () => hasher.Hash(Guid.NewGuid().ToString("N")))!;

    private static ConflictException EmailTaken() => new("Email này đã được sử dụng.", "email");

    [LoggerMessage(Level = LogLevel.Information, Message = "User {UserId} registered")]
    private partial void LogRegistered(Guid userId);

    // The attempted email is intentionally not logged.
    [LoggerMessage(Level = LogLevel.Warning, Message = "Login failed: invalid credentials")]
    private partial void LogLoginFailed();

    [LoggerMessage(Level = LogLevel.Information, Message = "User {UserId} changed password")]
    private partial void LogPasswordChanged(Guid userId);
}
