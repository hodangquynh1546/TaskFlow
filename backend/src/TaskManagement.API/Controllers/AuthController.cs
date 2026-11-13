using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TaskManagement.Application.Auth;
using TaskManagement.Application.Users;

namespace TaskManagement.API.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IAuthService auth, IUserProfileService profile) : ControllerBase
{
    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, await auth.RegisterAsync(request, cancellationToken));

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken cancellationToken) =>
        await auth.LoginAsync(request, cancellationToken);

    /// <summary>Trades a refresh token for a new access token and a new refresh token; the old refresh token stops working.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshRequest request, CancellationToken cancellationToken) =>
        await auth.RefreshAsync(request, cancellationToken);

    /// <summary>
    /// Ends this device's session on the server. Anonymous on purpose: the refresh token is the credential, and a
    /// device whose access token has already expired must still be able to sign out.
    /// </summary>
    [HttpPost("logout")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(LogoutRequest? request, CancellationToken cancellationToken)
    {
        await auth.LogoutAsync(request ?? new LogoutRequest(null), cancellationToken);
        return NoContent();
    }

    [HttpGet("me")]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<UserDto>> Me(CancellationToken cancellationToken) =>
        await profile.GetAsync(cancellationToken);

    [HttpPost("change-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        await auth.ChangePasswordAsync(request, cancellationToken);
        return NoContent();
    }
}
