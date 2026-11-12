using System.Text.RegularExpressions;
using FluentValidation;

namespace TaskManagement.Application.Common;

/// <summary>AC-03: 8–128 characters with at least one upper-case letter, one lower-case letter and one digit.</summary>
public static partial class PasswordPolicy
{
    public const int MinLength = 8;
    public const int MaxLength = 128;

    /// <summary>Returns every unmet requirement so the user can fix them all in one go.</summary>
    public static IReadOnlyList<string> Check(string? password)
    {
        if (string.IsNullOrEmpty(password))
        {
            return ["Mật khẩu không được để trống."];
        }

        var problems = new List<string>();
        if (password.Length < MinLength)
        {
            problems.Add($"Mật khẩu phải có ít nhất {MinLength} ký tự.");
        }
        if (password.Length > MaxLength)
        {
            problems.Add($"Mật khẩu tối đa {MaxLength} ký tự.");
        }
        if (!UpperCase().IsMatch(password))
        {
            problems.Add("Mật khẩu phải có ít nhất một chữ hoa.");
        }
        if (!LowerCase().IsMatch(password))
        {
            problems.Add("Mật khẩu phải có ít nhất một chữ thường.");
        }
        if (!Digit().IsMatch(password))
        {
            problems.Add("Mật khẩu phải có ít nhất một chữ số.");
        }
        return problems;
    }

    public static IRuleBuilderOptionsConditions<T, string?> MeetsPasswordPolicy<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Custom((value, context) =>
        {
            foreach (var problem in Check(value))
            {
                context.AddFailure(problem);
            }
        });

    [GeneratedRegex(@"\p{Lu}")]
    private static partial Regex UpperCase();

    [GeneratedRegex(@"\p{Ll}")]
    private static partial Regex LowerCase();

    [GeneratedRegex("[0-9]")]
    private static partial Regex Digit();
}
