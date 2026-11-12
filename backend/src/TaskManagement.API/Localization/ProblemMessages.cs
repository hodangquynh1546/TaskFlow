using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace TaskManagement.API.Localization;

public enum ResponseLanguage
{
    Vietnamese,
    English,
}

/// <summary>
/// The Domain and Application layers write their messages in Vietnamese (the source language). This is the presentation
/// concern of showing them in the language the client asked for with Accept-Language, so those layers stay free of
/// localization. A test scans the source for message literals and fails if one has no translation here.
/// </summary>
public static class ProblemMessages
{
    private static readonly Dictionary<string, string> Exact = new(StringComparer.Ordinal)
    {
        ["Bạn chưa đăng nhập hoặc phiên đã hết hạn."] = "You are not signed in, or your session has expired.",
        ["Chiều sắp xếp không hợp lệ."] = "The sort direction is not valid.",
        ["Công việc phải thuộc về một người dùng."] = "A task must belong to a user.",
        ["Cần nhập đúng mật khẩu hiện tại để đổi email."] = "Enter your current password to change your email.",
        ["Email hoặc mật khẩu không đúng."] = "Incorrect email or password.",
        ["Email không hợp lệ."] = "This email address is not valid.",
        ["Email không được để trống."] = "Email cannot be empty.",
        ["Email này đã được sử dụng."] = "This email is already in use.",
        ["Giá trị không hợp lệ."] = "This value is not valid.",
        ["Giờ bắt đầu lọc không được sau giờ kết thúc lọc."] = "The filter start time cannot be after the filter end time.",
        ["Họ tên không được để trống."] = "Full name cannot be empty.",
        ["Không tìm thấy công việc."] = "Task not found.",
        ["Mật khẩu hiện tại không đúng."] = "The current password is incorrect.",
        ["Mật khẩu không hợp lệ."] = "The password is not valid.",
        ["Mật khẩu không được để trống."] = "Password cannot be empty.",
        ["Mật khẩu mới phải khác mật khẩu hiện tại."] = "The new password must be different from the current one.",
        ["Mật khẩu phải có ít nhất một chữ hoa."] = "The password needs at least one uppercase letter.",
        ["Mật khẩu phải có ít nhất một chữ số."] = "The password needs at least one digit.",
        ["Mật khẩu phải có ít nhất một chữ thường."] = "The password needs at least one lowercase letter.",
        ["Mức ưu tiên không hợp lệ."] = "The priority is not valid.",
        ["Mức ưu tiên là bắt buộc."] = "Priority is required.",
        ["Một hoặc nhiều trường không hợp lệ."] = "One or more fields are not valid.",
        ["Ngày bắt đầu không được sau hạn hoàn thành."] = "The start date cannot be after the due date.",
        ["Ngày bắt đầu lọc không được sau ngày kết thúc lọc."] = "The filter start date cannot be after the filter end date.",
        ["Nội dung yêu cầu không hợp lệ."] = "The request body is not valid.",
        ["Trường sắp xếp không hợp lệ."] = "The sort field is not valid.",
        ["Trạng thái không hợp lệ."] = "The status is not valid.",
        ["Trạng thái là bắt buộc."] = "Status is required.",
        ["Tài khoản không còn tồn tại."] = "This account no longer exists.",
        ["Tiêu đề không được để trống."] = "Title cannot be empty.",
        ["Vui lòng nhập mật khẩu hiện tại."] = "Enter your current password.",
        ["Yêu cầu không hợp lệ."] = "The request is not valid.",
        ["Đã có lỗi xảy ra. Vui lòng thử lại sau."] = "Something went wrong. Please try again later.",
    };

    // Messages that carry a number. The pattern matches the Vietnamese text, the template is the English one.
    private static readonly (Regex Pattern, string Template)[] Patterns =
    [
        (MessagePattern(@"Email phải từ 1 đến (\d+) ký tự\."), "Email must be 1 to $1 characters."),
        (MessagePattern(@"Email tối đa (\d+) ký tự\."), "Email can be at most $1 characters."),
        (MessagePattern(@"Họ tên phải từ 1 đến (\d+) ký tự\."), "Full name must be 1 to $1 characters."),
        (MessagePattern(@"Họ tên tối đa (\d+) ký tự\."), "Full name can be at most $1 characters."),
        (MessagePattern(@"Mô tả tối đa (\d+) ký tự\."), "Description can be at most $1 characters."),
        (MessagePattern(@"Mật khẩu phải có ít nhất (\d+) ký tự\."), "The password needs at least $1 characters."),
        (MessagePattern(@"Mật khẩu tối đa (\d+) ký tự\."), "Password can be at most $1 characters."),
        (MessagePattern(@"Số mục mỗi trang phải từ 1 đến (\d+)\."), "Page size must be 1 to $1."),
        (MessagePattern(@"Số mục phải từ 1 đến (\d+)\."), "The number of items must be 1 to $1."),
        (MessagePattern(@"Số ngày phải từ 1 đến (\d+)\."), "The number of days must be 1 to $1."),
        (MessagePattern(@"Thời lượng phải từ 1 đến (\d+) phút\."), "Duration must be 1 to $1 minutes."),
        (MessagePattern(@"Tiêu đề phải từ 1 đến (\d+) ký tự\."), "Title must be 1 to $1 characters."),
        (MessagePattern(@"Tiêu đề tối đa (\d+) ký tự\."), "Title can be at most $1 characters."),
        (MessagePattern(@"Trang phải từ 1 đến (\d+)\."), "Page must be 1 to $1."),
        (MessagePattern(@"Từ khóa tối đa (\d+) ký tự\."), "The search text can be at most $1 characters."),
    ];

    private static readonly Dictionary<int, string> EnglishTitles = new()
    {
        [StatusCodes.Status400BadRequest] = "Invalid data",
        [StatusCodes.Status401Unauthorized] = "Not signed in",
        [StatusCodes.Status404NotFound] = "Not found",
        [StatusCodes.Status409Conflict] = "Duplicate data",
        [StatusCodes.Status429TooManyRequests] = "Too many requests",
        [StatusCodes.Status500InternalServerError] = "Server error",
    };

    private static Regex MessagePattern(string body) => new($"^{body}$", RegexOptions.CultureInvariant | RegexOptions.NonBacktracking);

    /// <summary>The first supported language by quality in Accept-Language; Vietnamese (the source language) when none matches.</summary>
    public static ResponseLanguage Resolve(HttpRequest request)
    {
        var accepted = request.GetTypedHeaders().AcceptLanguage;
        foreach (var language in accepted.OrderByDescending(l => l.Quality ?? 1.0))
        {
            if (language.Quality is 0)
            {
                continue;
            }

            var tag = language.Value.Value ?? string.Empty;
            if (tag.StartsWith("en", StringComparison.OrdinalIgnoreCase))
            {
                return ResponseLanguage.English;
            }

            if (tag.StartsWith("vi", StringComparison.OrdinalIgnoreCase))
            {
                return ResponseLanguage.Vietnamese;
            }
        }

        return ResponseLanguage.Vietnamese;
    }

    /// <summary>The English text for a Vietnamese message, or null when there is no translation.</summary>
    public static string? TryTranslate(string vietnamese)
    {
        if (Exact.TryGetValue(vietnamese, out var exact))
        {
            return exact;
        }

        foreach (var (pattern, template) in Patterns)
        {
            var match = pattern.Match(vietnamese);
            if (match.Success)
            {
                return template.Replace("$1", match.Groups[1].Value, StringComparison.Ordinal);
            }
        }

        return null;
    }

    /// <summary>Unknown messages stay Vietnamese rather than being guessed; the completeness test keeps that from happening.</summary>
    public static string Translate(string message, ResponseLanguage language) =>
        language == ResponseLanguage.English ? TryTranslate(message) ?? message : message;

    public static string TitleFor(int status, string vietnamese, ResponseLanguage language) =>
        language == ResponseLanguage.English ? EnglishTitles.GetValueOrDefault(status, "Request failed") : vietnamese;

    /// <summary>Translates title, detail and per-field messages of a problem body and labels the response language.</summary>
    public static void Localize(HttpContext context, ProblemDetails problem)
    {
        context.Response.Headers.ContentLanguage = Resolve(context.Request) == ResponseLanguage.English ? "en" : "vi";
        context.Response.Headers.Append(HeaderNames.Vary, HeaderNames.AcceptLanguage);

        var language = Resolve(context.Request);
        if (language == ResponseLanguage.Vietnamese)
        {
            return;
        }

        problem.Detail = problem.Detail is null ? null : Translate(problem.Detail, language);
        if (problem is Microsoft.AspNetCore.Http.HttpValidationProblemDetails validation)
        {
            foreach (var key in validation.Errors.Keys.ToList())
            {
                validation.Errors[key] = validation.Errors[key].Select(m => Translate(m, language)).ToArray();
            }
        }
    }
}
