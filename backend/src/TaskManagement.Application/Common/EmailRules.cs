using System.Text.RegularExpressions;
using FluentValidation;
using TaskManagement.Domain.Entities;

namespace TaskManagement.Application.Common;

public static partial class EmailRules
{
    /// <summary>AC-01. Expects the already-normalised address (see <see cref="User.NormalizeEmail"/>).</summary>
    public static IRuleBuilderOptions<T, string> MustBeValidEmail<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithMessage("Email không được để trống.")
            .MaximumLength(User.EmailMaxLength).WithMessage($"Email tối đa {User.EmailMaxLength} ký tự.")
            .Must(email => string.IsNullOrEmpty(email) || Shape().IsMatch(email)).WithMessage("Email không hợp lệ.");

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex Shape();
}
