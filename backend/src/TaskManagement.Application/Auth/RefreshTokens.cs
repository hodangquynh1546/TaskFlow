using System.Security.Cryptography;
using System.Text;

namespace TaskManagement.Application.Auth;

/// <summary>Generating and hashing refresh tokens. The raw value is shown to the client once and never stored.</summary>
internal static class RefreshTokens
{
    public const int MaxLength = 200;

    public static string Generate() => Base64Url(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
