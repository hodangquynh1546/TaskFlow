using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace TaskManagement.IntegrationTests.Infrastructure;

/// <summary>Builds tokens that deliberately differ from what the real service issues.</summary>
public static class TestTokens
{
    public static string Create(
        string? subject,
        string key = ApiFactory.JwtKey,
        string issuer = ApiFactory.Issuer,
        string audience = ApiFactory.Audience,
        TimeSpan? expiresIn = null,
        string algorithm = SecurityAlgorithms.HmacSha256)
    {
        var expires = DateTime.UtcNow + (expiresIn ?? TimeSpan.FromMinutes(30));
        var claims = new Dictionary<string, object>();
        if (subject is not null)
        {
            claims[JwtRegisteredClaimNames.Sub] = subject;
        }

        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Claims = claims,
            NotBefore = expires.AddHours(-2),
            IssuedAt = expires.AddHours(-2),
            Expires = expires,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), algorithm),
        });
    }
}
