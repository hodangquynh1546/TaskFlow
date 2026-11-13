namespace TaskManagement.Domain.Entities;

/// <summary>
/// A long-lived credential that lets a signed-in device ask for new short-lived access tokens without a password.
/// Only a hash is stored. Each use rotates it: the old one is marked rotated and a new one in the same family is
/// issued. A rotated token shown again after a short grace period means a copy was stolen, so the whole family dies.
/// </summary>
public sealed class RefreshToken
{
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }

    /// <summary>All tokens descended from one sign-in; revoking the family ends that device's session.</summary>
    public Guid FamilyId { get; private set; }

    public string TokenHash { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public DateTimeOffset? RotatedAt { get; private set; }
    public DateTimeOffset? RevokedAt { get; private set; }

    private RefreshToken() { }

    public static RefreshToken Issue(Guid userId, Guid familyId, string tokenHash, DateTimeOffset now, TimeSpan lifetime) => new()
    {
        Id = Guid.CreateVersion7(),
        UserId = userId,
        FamilyId = familyId,
        TokenHash = tokenHash,
        CreatedAt = now.ToUniversalTime(),
        ExpiresAt = (now + lifetime).ToUniversalTime(),
    };

    public bool IsExpired(DateTimeOffset now) => ExpiresAt <= now;

    public void MarkRotated(DateTimeOffset now) => RotatedAt ??= now.ToUniversalTime();

    public void Revoke(DateTimeOffset now) => RevokedAt ??= now.ToUniversalTime();
}
