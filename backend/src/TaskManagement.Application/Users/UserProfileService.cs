using FluentValidation;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Application.Abstractions;
using TaskManagement.Application.Auth;
using TaskManagement.Application.Common;
using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.Application.Users;

/// <summary>CurrentPassword is only required (and checked) when the email changes (AC-06).</summary>
public sealed record UpdateProfileRequest(string FullName, string Email, string? CurrentPassword);

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.FullName).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Họ tên không được để trống.")
            .Must(n => n is null || n.Trim().Length <= User.FullNameMaxLength).WithMessage($"Họ tên tối đa {User.FullNameMaxLength} ký tự.");
        RuleFor(x => x.Email).MustBeValidEmail();
        RuleFor(x => x.CurrentPassword).MaximumLength(PasswordPolicy.MaxLength).WithMessage($"Mật khẩu tối đa {PasswordPolicy.MaxLength} ký tự.");
    }
}

public interface IUserProfileService
{
    Task<UserDto> GetAsync(CancellationToken cancellationToken);

    Task<UserDto> UpdateAsync(UpdateProfileRequest request, CancellationToken cancellationToken);
}

internal sealed class UserProfileService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IPasswordHasher hasher,
    TimeProvider clock,
    IValidator<UpdateProfileRequest> validator) : IUserProfileService
{
    public async Task<UserDto> GetAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new UnauthorizedException("Tài khoản không còn tồn tại.");
        return UserDto.From(user);
    }

    public async Task<UserDto> UpdateAsync(UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var normalized = request with { Email = User.NormalizeEmail(request.Email ?? string.Empty) };
        await validator.ValidateAndThrowAsync(normalized, cancellationToken);

        var userId = currentUser.UserId;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new UnauthorizedException("Tài khoản không còn tồn tại.");

        if (normalized.Email != user.Email)
        {
            if (string.IsNullOrEmpty(normalized.CurrentPassword) || !hasher.Verify(user.PasswordHash, normalized.CurrentPassword))
            {
                throw new DomainException("Cần nhập đúng mật khẩu hiện tại để đổi email.", "currentPassword");
            }
            if (await EmailUsedByOtherAsync(normalized.Email, userId, cancellationToken))
            {
                throw EmailTaken();
            }
        }

        user.UpdateProfile(normalized.FullName, normalized.Email, clock.GetUtcNow());
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            if (await EmailUsedByOtherAsync(normalized.Email, userId, cancellationToken))
            {
                throw EmailTaken();
            }
            throw;
        }

        return UserDto.From(user);
    }

    private Task<bool> EmailUsedByOtherAsync(string email, Guid userId, CancellationToken cancellationToken) =>
        db.Users.AsNoTracking().AnyAsync(u => u.Email == email && u.Id != userId, cancellationToken);

    private static ConflictException EmailTaken() => new("Email này đã được sử dụng.", "email");
}
