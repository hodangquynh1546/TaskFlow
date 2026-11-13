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

    /// <summary>Trades a refresh token for a new access token and a new refresh token (rotation).</summary>
    Task<AuthResponse> RefreshAsync(RefreshRequest request, CancellationToken cancellationToken);

    /// <summary>Ends the device's session. Never fails: an unknown or missing token simply has nothing to end.</summary>
    Task LogoutAsync(LogoutRequest request, CancellationToken cancellationToken);
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
    IValidator<RefreshRequest> refreshValidator,
    ILogger<AuthService> logger) : IAuthService
{
    private const string InvalidCredentials = "Email hoặc mật khẩu không đúng.";
    private const string SessionExpired = "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";

    /// <summary>
    /// A rotated token shown again this soon is two tabs (or a retry) racing with the same token, not a thief: it is
    /// honoured. Later than this it is treated as theft and the whole sign-in is ended.
    /// </summary>
    private static readonly TimeSpan ReuseGrace = TimeSpan.FromSeconds(30);

    /// <summary>Revoked and expired rows are kept this long for investigation, then removed with the next sign-in.</summary>
    private static readonly TimeSpan KeepDeadTokens = TimeSpan.FromDays(7);

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
        return await IssueAsync(user, Guid.CreateVersion7(), cancellationToken);
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

        return await IssueAsync(user!, Guid.CreateVersion7(), cancellationToken);
    }

    public async Task<AuthResponse> RefreshAsync(RefreshRequest request, CancellationToken cancellationToken)
    {
        await refreshValidator.ValidateAndThrowAsync(request, cancellationToken);

        var now = clock.GetUtcNow();
        var hash = RefreshTokens.Hash(request.RefreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (stored is null || stored.RevokedAt is not null || stored.IsExpired(now))
        {
            throw new UnauthorizedException(SessionExpired);
        }

        if (stored.RotatedAt is { } rotatedAt && now - rotatedAt > ReuseGrace)
        {
            await RevokeFamilyAsync(stored.FamilyId, now, cancellationToken);
            LogRefreshTokenReused(stored.UserId);
            throw new UnauthorizedException(SessionExpired);
        }

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == stored.UserId, cancellationToken)
            ?? throw new UnauthorizedException(SessionExpired);

        stored.MarkRotated(now);
        return await IssueAsync(user, stored.FamilyId, cancellationToken);
    }

    public async Task LogoutAsync(LogoutRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.RefreshToken) || request.RefreshToken.Length > RefreshTokens.MaxLength)
        {
            return;
        }

        var hash = RefreshTokens.Hash(request.RefreshToken);
        var stored = await db.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (stored is not null)
        {
            await RevokeFamilyAsync(stored.FamilyId, clock.GetUtcNow(), cancellationToken);
        }
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

        var now = clock.GetUtcNow();
        user.ChangePasswordHash(hasher.Hash(request.NewPassword), now);

        // Whoever else is signed in with the old password is signed out; this device keeps its session.
        Guid? keepFamily = null;
        if (!string.IsNullOrEmpty(request.RefreshToken) && request.RefreshToken.Length <= RefreshTokens.MaxLength)
        {
            var hash = RefreshTokens.Hash(request.RefreshToken);
            keepFamily = await db.RefreshTokens.AsNoTracking()
                .Where(t => t.TokenHash == hash && t.UserId == userId)
                .Select(t => (Guid?)t.FamilyId)
                .FirstOrDefaultAsync(cancellationToken);
        }
        var others = await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null && t.FamilyId != keepFamily).ToListAsync(cancellationToken);
        others.ForEach(t => t.Revoke(now));

        await db.SaveChangesAsync(cancellationToken);
        LogPasswordChanged(user.Id);
    }

    /// <summary>Creates the access token and a fresh refresh token in <paramref name="familyId"/>, and saves any pending changes with it.</summary>
    private async Task<AuthResponse> IssueAsync(User user, Guid familyId, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var access = tokens.Create(user);
        var refresh = RefreshTokens.Generate();
        db.RefreshTokens.Add(RefreshToken.Issue(user.Id, familyId, RefreshTokens.Hash(refresh), now, tokens.RefreshLifetime));

        var stale = await db.RefreshTokens
            .Where(t => t.UserId == user.Id && (t.ExpiresAt < now - KeepDeadTokens || t.RevokedAt < now - KeepDeadTokens))
            .ToListAsync(cancellationToken);
        db.RefreshTokens.RemoveRange(stale);

        await db.SaveChangesAsync(cancellationToken);
        return new AuthResponse(access.Value, access.ExpiresAt, refresh, UserDto.From(user));
    }

    private async Task RevokeFamilyAsync(Guid familyId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var family = await db.RefreshTokens.Where(t => t.FamilyId == familyId && t.RevokedAt == null).ToListAsync(cancellationToken);
        family.ForEach(t => t.Revoke(now));
        await db.SaveChangesAsync(cancellationToken);
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

    // A copy of a refresh token was used after the real one moved on: someone may have stolen it.
    [LoggerMessage(Level = LogLevel.Warning, Message = "Refresh token reuse for user {UserId}; the whole session was revoked")]
    private partial void LogRefreshTokenReused(Guid userId);

    [LoggerMessage(Level = LogLevel.Information, Message = "User {UserId} changed password")]
    private partial void LogPasswordChanged(Guid userId);
}
