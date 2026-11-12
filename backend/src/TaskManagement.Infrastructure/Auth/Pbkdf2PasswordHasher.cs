using Microsoft.AspNetCore.Identity;
using TaskManagement.Application.Abstractions;
using TaskManagement.Domain.Entities;

namespace TaskManagement.Infrastructure.Auth;

/// <summary>Wraps ASP.NET Core Identity's PBKDF2 hasher (salted, versioned, upgradable); only the hasher is used, not the Identity framework.</summary>
internal sealed class Pbkdf2PasswordHasher : IPasswordHasher
{
    private readonly PasswordHasher<User> _inner = new();

    // The user argument is unused by the algorithm; null is the documented way to hash without an entity.
    public string Hash(string password) => _inner.HashPassword(null!, password);

    public bool Verify(string passwordHash, string password)
    {
        try
        {
            return _inner.VerifyHashedPassword(null!, passwordHash, password) != PasswordVerificationResult.Failed;
        }
        catch (FormatException)
        {
            // Identity throws on a stored value that is not valid Base64. A corrupt hash must read as "wrong password", not as a server error.
            return false;
        }
    }
}
