namespace TaskManagement.Application.Common;

/// <summary>The resource does not exist, or does not belong to the caller (BR-10 deliberately makes these identical).</summary>
public sealed class NotFoundException(string message) : Exception(message);

/// <summary>The request conflicts with existing data, e.g. an email that is already registered.</summary>
public sealed class ConflictException(string message, string? field = null) : Exception(message)
{
    public string? Field { get; } = field;
}

/// <summary>Missing or invalid credentials or token.</summary>
public sealed class UnauthorizedException(string message) : Exception(message);
