namespace TaskManagement.Domain.Exceptions;

/// <summary>Raised when a business rule is violated. <see cref="Field"/> lets the API point at the offending input.</summary>
public sealed class DomainException(string message, string? field = null) : Exception(message)
{
    public string? Field { get; } = field;
}
