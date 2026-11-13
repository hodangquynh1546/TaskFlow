using System.Globalization;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using TaskManagement.Application.Abstractions;
using TaskManagement.Domain.Entities;

namespace TaskManagement.Infrastructure.Auth;

internal sealed class JwtTokenService(IOptions<JwtOptions> options, TimeProvider clock) : IJwtTokenService
{
    private readonly JwtOptions _options = options.Value;

    public TimeSpan RefreshLifetime => TimeSpan.FromDays(_options.RefreshDays);

    public AccessToken Create(User user)
    {
        var now = clock.GetUtcNow();
        var expires = now.AddMinutes(_options.ExpiresMinutes);

        // Only the subject is carried: name/email in the token would go stale after a profile change.
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            Claims = new Dictionary<string, object>
            {
                [JwtRegisteredClaimNames.Sub] = user.Id.ToString(),
                [JwtRegisteredClaimNames.Jti] = Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture),
            },
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key)),
                SecurityAlgorithms.HmacSha256),
        };

        return new AccessToken(new JsonWebTokenHandler().CreateToken(descriptor), expires);
    }
}
