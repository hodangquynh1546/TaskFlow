using FluentValidation;
using TaskManagement.Application.Common;
using TaskManagement.Domain.Entities;

namespace TaskManagement.Application.Auth;

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.FullName).Must(n => !string.IsNullOrWhiteSpace(n)).WithMessage("Họ tên không được để trống.")
            .Must(n => n is null || n.Trim().Length <= User.FullNameMaxLength).WithMessage($"Họ tên tối đa {User.FullNameMaxLength} ký tự.");
        RuleFor(x => x.Email).MustBeValidEmail();
        RuleFor(x => x.Password).MeetsPasswordPolicy();
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        // Deliberately not the full policy: login must not reveal rules, and old accounts may predate them.
        RuleFor(x => x.Email).NotEmpty().WithMessage("Email không được để trống.");
        RuleFor(x => x.Password).NotEmpty().WithMessage("Mật khẩu không được để trống.")
            .MaximumLength(PasswordPolicy.MaxLength).WithMessage($"Mật khẩu tối đa {PasswordPolicy.MaxLength} ký tự.");
    }
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().WithMessage("Vui lòng nhập mật khẩu hiện tại.")
            .MaximumLength(PasswordPolicy.MaxLength).WithMessage($"Mật khẩu tối đa {PasswordPolicy.MaxLength} ký tự.");
        RuleFor(x => x.NewPassword).MeetsPasswordPolicy();
    }
}
