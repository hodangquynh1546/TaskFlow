using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using TaskManagement.Application.Abstractions;
using TaskManagement.Application.Common;

namespace TaskManagement.API.Services;

internal sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public Guid UserId
    {
        get
        {
            var value = accessor.HttpContext?.User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            return Guid.TryParse(value, out var id)
                ? id
                : throw new UnauthorizedException("Bạn chưa đăng nhập hoặc phiên đã hết hạn.");
        }
    }
}
