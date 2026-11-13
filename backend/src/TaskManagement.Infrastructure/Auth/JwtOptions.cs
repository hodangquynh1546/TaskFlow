namespace TaskManagement.Infrastructure.Auth;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";
    public const int MinKeyBytes = 32;

    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int ExpiresMinutes { get; set; } = 60;

    /// <summary>Days a device stays signed in without being used; every use starts the count again.</summary>
    public int RefreshDays { get; set; } = 90;

    /// <summary>Returns an error message, or null when the options are usable. Used to fail fast at startup.</summary>
    public string? Validate()
    {
        if (System.Text.Encoding.UTF8.GetByteCount(Key) < MinKeyBytes)
        {
            return $"Jwt:Key must be at least {MinKeyBytes} bytes. Provide it via environment variable or user-secrets.";
        }
        if (string.IsNullOrWhiteSpace(Issuer) || string.IsNullOrWhiteSpace(Audience))
        {
            return "Jwt:Issuer and Jwt:Audience are required.";
        }
        if (ExpiresMinutes is < 1 or > 1440)
        {
            return "Jwt:ExpiresMinutes must be between 1 and 1440.";
        }
        if (RefreshDays is < 1 or > 365)
        {
            return "Jwt:RefreshDays must be between 1 and 365.";
        }
        return null;
    }
}
