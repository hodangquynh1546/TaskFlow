using Microsoft.AspNetCore.Mvc;
using TaskManagement.Application.Auth;
using TaskManagement.Application.Users;

namespace TaskManagement.API.Controllers;

[ApiController]
[Route("api/users")]
public sealed class UsersController(IUserProfileService profile) : ControllerBase
{
    [HttpGet("profile")]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<UserDto>> GetProfile(CancellationToken cancellationToken) =>
        await profile.GetAsync(cancellationToken);

    [HttpPut("profile")]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<UserDto>> UpdateProfile(UpdateProfileRequest request, CancellationToken cancellationToken) =>
        await profile.UpdateAsync(request, cancellationToken);
}
