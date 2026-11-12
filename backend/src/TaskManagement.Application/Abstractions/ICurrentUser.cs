namespace TaskManagement.Application.Abstractions;

/// <summary>The authenticated caller. The id always comes from the validated token, never from request input.</summary>
public interface ICurrentUser
{
    /// <exception cref="Common.UnauthorizedException">No authenticated user.</exception>
    Guid UserId { get; }
}
