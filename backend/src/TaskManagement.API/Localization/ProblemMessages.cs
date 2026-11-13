using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace TaskManagement.API.Localization;

public enum ResponseLanguage
{
    Vietnamese,
    English,
    Japanese,
    Chinese,
}

/// <summary>
/// The Domain and Application layers write their messages in Vietnamese (the source language). This is the presentation
/// concern of showing them in the language the client asked for with Accept-Language, so those layers stay free of
/// localization. A test scans the source for message literals and fails if one has no translation in every language here.
/// </summary>
public static class ProblemMessages
{
    private sealed record Translation(string English, string Japanese, string Chinese)
    {
        public string For(ResponseLanguage language) => language switch
        {
            ResponseLanguage.English => English,
            ResponseLanguage.Japanese => Japanese,
            _ => Chinese,
        };
    }

    private static readonly Dictionary<string, Translation> Exact = new(StringComparer.Ordinal)
    {
        ["Bạn chưa đăng nhập hoặc phiên đã hết hạn."] = new("You are not signed in, or your session has expired.", "ログインしていないか、セッションの有効期限が切れています。", "您尚未登录，或登录已过期。"),
        ["Chiều sắp xếp không hợp lệ."] = new("The sort direction is not valid.", "並べ替えの方向が正しくありません。", "排序方向无效。"),
        ["Công việc phải thuộc về một người dùng."] = new("A task must belong to a user.", "タスクはユーザーに属している必要があります。", "任务必须属于某个用户。"),
        ["Cần nhập đúng mật khẩu hiện tại để đổi email."] = new("Enter your current password to change your email.", "メールアドレスを変更するには、現在のパスワードを入力してください。", "修改邮箱需要输入当前密码。"),
        ["Email hoặc mật khẩu không đúng."] = new("Incorrect email or password.", "メールアドレスまたはパスワードが正しくありません。", "邮箱或密码不正确。"),
        ["Email không hợp lệ."] = new("This email address is not valid.", "メールアドレスの形式が正しくありません。", "邮箱格式无效。"),
        ["Email không được để trống."] = new("Email cannot be empty.", "メールアドレスを入力してください。", "邮箱不能为空。"),
        ["Email này đã được sử dụng."] = new("This email is already in use.", "このメールアドレスはすでに使用されています。", "该邮箱已被使用。"),
        ["Giá trị không hợp lệ."] = new("This value is not valid.", "値が正しくありません。", "值无效。"),
        ["Giờ bắt đầu lọc không được sau giờ kết thúc lọc."] = new("The filter start time cannot be after the filter end time.", "絞り込みの開始時刻は終了時刻より後にできません。", "筛选的开始时间不能晚于结束时间。"),
        ["Họ tên không được để trống."] = new("Full name cannot be empty.", "氏名を入力してください。", "姓名不能为空。"),
        ["Khoảng báo cáo không hợp lệ."] = new("The report period is not valid.", "レポートの期間が正しくありません。", "报告周期无效。"),
        ["Không tìm thấy công việc."] = new("Task not found.", "タスクが見つかりません。", "未找到该任务。"),
        ["Múi giờ không hợp lệ."] = new("The time zone is not valid.", "タイムゾーンが正しくありません。", "时区无效。"),
        ["Mật khẩu hiện tại không đúng."] = new("The current password is incorrect.", "現在のパスワードが正しくありません。", "当前密码不正确。"),
        ["Mật khẩu không hợp lệ."] = new("The password is not valid.", "パスワードが正しくありません。", "密码无效。"),
        ["Mật khẩu không được để trống."] = new("Password cannot be empty.", "パスワードを入力してください。", "密码不能为空。"),
        ["Mật khẩu mới phải khác mật khẩu hiện tại."] = new("The new password must be different from the current one.", "新しいパスワードは現在のパスワードと異なるものにしてください。", "新密码不能与当前密码相同。"),
        ["Mật khẩu phải có ít nhất một chữ hoa."] = new("The password needs at least one uppercase letter.", "パスワードには大文字を1文字以上含めてください。", "密码至少需要一个大写字母。"),
        ["Mật khẩu phải có ít nhất một chữ số."] = new("The password needs at least one digit.", "パスワードには数字を1文字以上含めてください。", "密码至少需要一个数字。"),
        ["Mật khẩu phải có ít nhất một chữ thường."] = new("The password needs at least one lowercase letter.", "パスワードには小文字を1文字以上含めてください。", "密码至少需要一个小写字母。"),
        ["Mã làm mới phiên không hợp lệ."] = new("The session token is not valid.", "セッショントークンが正しくありません。", "会话令牌无效。"),
        ["Một hoặc nhiều trường không hợp lệ."] = new("One or more fields are not valid.", "正しくない項目があります。", "有一个或多个字段无效。"),
        ["Mức ưu tiên không hợp lệ."] = new("The priority is not valid.", "優先度が正しくありません。", "优先级无效。"),
        ["Mức ưu tiên là bắt buộc."] = new("Priority is required.", "優先度は必須です。", "优先级为必填项。"),
        ["Ngày bắt đầu không được sau hạn hoàn thành."] = new("The start date cannot be after the due date.", "開始日は期限より後にできません。", "开始日期不能晚于截止日期。"),
        ["Ngày bắt đầu lọc không được sau ngày kết thúc lọc."] = new("The filter start date cannot be after the filter end date.", "絞り込みの開始日は終了日より後にできません。", "筛选的开始日期不能晚于结束日期。"),
        ["Nội dung yêu cầu không hợp lệ."] = new("The request body is not valid.", "リクエストの内容が正しくありません。", "请求内容无效。"),
        ["Tiêu đề không được để trống."] = new("Title cannot be empty.", "タイトルを入力してください。", "标题不能为空。"),
        ["Trường sắp xếp không hợp lệ."] = new("The sort field is not valid.", "並べ替えの項目が正しくありません。", "排序字段无效。"),
        ["Trạng thái không hợp lệ."] = new("The status is not valid.", "ステータスが正しくありません。", "状态无效。"),
        ["Trạng thái là bắt buộc."] = new("Status is required.", "ステータスは必須です。", "状态为必填项。"),
        ["Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."] = new("Your session has expired. Sign in again.", "セッションの有効期限が切れました。もう一度ログインしてください。", "登录已过期，请重新登录。"),
        ["Tài khoản không còn tồn tại."] = new("This account no longer exists.", "このアカウントは存在しません。", "该账号已不存在。"),
        ["Vui lòng nhập mật khẩu hiện tại."] = new("Enter your current password.", "現在のパスワードを入力してください。", "请输入当前密码。"),
        ["Yêu cầu không hợp lệ."] = new("The request is not valid.", "リクエストが正しくありません。", "请求无效。"),
        ["Đã có lỗi xảy ra. Vui lòng thử lại sau."] = new("Something went wrong. Please try again later.", "エラーが発生しました。しばらくしてからもう一度お試しください。", "出现错误，请稍后再试。"),
    };

    // Messages that carry a number. The pattern matches the Vietnamese text; $1 in a template is that number.
    private static readonly (Regex Pattern, Translation Template)[] Patterns =
    [
        (MessagePattern(@"Email phải từ 1 đến (\d+) ký tự\."), new("Email must be 1 to $1 characters.", "メールアドレスは1〜$1文字で入力してください。", "邮箱长度必须为 1 到 $1 个字符。")),
        (MessagePattern(@"Email tối đa (\d+) ký tự\."), new("Email can be at most $1 characters.", "メールアドレスは$1文字以内で入力してください。", "邮箱最多 $1 个字符。")),
        (MessagePattern(@"Họ tên phải từ 1 đến (\d+) ký tự\."), new("Full name must be 1 to $1 characters.", "氏名は1〜$1文字で入力してください。", "姓名长度必须为 1 到 $1 个字符。")),
        (MessagePattern(@"Họ tên tối đa (\d+) ký tự\."), new("Full name can be at most $1 characters.", "氏名は$1文字以内で入力してください。", "姓名最多 $1 个字符。")),
        (MessagePattern(@"Mô tả tối đa (\d+) ký tự\."), new("Description can be at most $1 characters.", "説明は$1文字以内で入力してください。", "描述最多 $1 个字符。")),
        (MessagePattern(@"Mật khẩu phải có ít nhất (\d+) ký tự\."), new("The password needs at least $1 characters.", "パスワードは$1文字以上で入力してください。", "密码至少需要 $1 个字符。")),
        (MessagePattern(@"Mật khẩu tối đa (\d+) ký tự\."), new("Password can be at most $1 characters.", "パスワードは$1文字以内で入力してください。", "密码最多 $1 个字符。")),
        (MessagePattern(@"Số mục mỗi trang phải từ 1 đến (\d+)\."), new("Page size must be 1 to $1.", "1ページの件数は1〜$1にしてください。", "每页条数必须为 1 到 $1。")),
        (MessagePattern(@"Số mục phải từ 1 đến (\d+)\."), new("The number of items must be 1 to $1.", "件数は1〜$1にしてください。", "条数必须为 1 到 $1。")),
        (MessagePattern(@"Số ngày phải từ 1 đến (\d+)\."), new("The number of days must be 1 to $1.", "日数は1〜$1にしてください。", "天数必须为 1 到 $1。")),
        (MessagePattern(@"Thời lượng phải từ 1 đến (\d+) phút\."), new("Duration must be 1 to $1 minutes.", "所要時間は1〜$1分にしてください。", "时长必须为 1 到 $1 分钟。")),
        (MessagePattern(@"Tiêu đề phải từ 1 đến (\d+) ký tự\."), new("Title must be 1 to $1 characters.", "タイトルは1〜$1文字で入力してください。", "标题长度必须为 1 到 $1 个字符。")),
        (MessagePattern(@"Tiêu đề tối đa (\d+) ký tự\."), new("Title can be at most $1 characters.", "タイトルは$1文字以内で入力してください。", "标题最多 $1 个字符。")),
        (MessagePattern(@"Trang phải từ 1 đến (\d+)\."), new("Page must be 1 to $1.", "ページは1〜$1にしてください。", "页码必须为 1 到 $1。")),
        (MessagePattern(@"Từ khóa tối đa (\d+) ký tự\."), new("The search text can be at most $1 characters.", "検索キーワードは$1文字以内で入力してください。", "搜索关键词最多 $1 个字符。")),
    ];

    private static readonly Dictionary<int, Translation> Titles = new()
    {
        [StatusCodes.Status400BadRequest] = new("Invalid data", "データが正しくありません", "数据无效"),
        [StatusCodes.Status401Unauthorized] = new("Not signed in", "ログインしていません", "未登录"),
        [StatusCodes.Status404NotFound] = new("Not found", "見つかりません", "未找到"),
        [StatusCodes.Status409Conflict] = new("Duplicate data", "データが重複しています", "数据重复"),
        [StatusCodes.Status429TooManyRequests] = new("Too many requests", "リクエストが多すぎます", "请求过多"),
        [StatusCodes.Status500InternalServerError] = new("Server error", "サーバーエラー", "服务器错误"),
    };

    private static readonly Translation FallbackTitle = new("Request failed", "リクエストに失敗しました", "请求失败");

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

            if (tag.StartsWith("ja", StringComparison.OrdinalIgnoreCase))
            {
                return ResponseLanguage.Japanese;
            }

            if (tag.StartsWith("zh", StringComparison.OrdinalIgnoreCase))
            {
                return ResponseLanguage.Chinese;
            }
        }

        return ResponseLanguage.Vietnamese;
    }

    /// <summary>The translation of a Vietnamese message, or null when there is none (or the language is Vietnamese).</summary>
    public static string? TryTranslate(string vietnamese, ResponseLanguage language = ResponseLanguage.English)
    {
        if (language == ResponseLanguage.Vietnamese)
        {
            return null;
        }

        if (Exact.TryGetValue(vietnamese, out var exact))
        {
            return exact.For(language);
        }

        foreach (var (pattern, template) in Patterns)
        {
            var match = pattern.Match(vietnamese);
            if (match.Success)
            {
                return template.For(language).Replace("$1", match.Groups[1].Value, StringComparison.Ordinal);
            }
        }

        return null;
    }

    /// <summary>Unknown messages stay Vietnamese rather than being guessed; the completeness test keeps that from happening.</summary>
    public static string Translate(string message, ResponseLanguage language) => TryTranslate(message, language) ?? message;

    public static string TitleFor(int status, string vietnamese, ResponseLanguage language) =>
        language == ResponseLanguage.Vietnamese ? vietnamese : Titles.GetValueOrDefault(status, FallbackTitle).For(language);

    public static string CodeOf(ResponseLanguage language) => language switch
    {
        ResponseLanguage.English => "en",
        ResponseLanguage.Japanese => "ja",
        ResponseLanguage.Chinese => "zh",
        _ => "vi",
    };

    /// <summary>Translates title, detail and per-field messages of a problem body and labels the response language.</summary>
    public static void Localize(HttpContext context, ProblemDetails problem)
    {
        var language = Resolve(context.Request);
        context.Response.Headers.ContentLanguage = CodeOf(language);
        context.Response.Headers.Append(HeaderNames.Vary, HeaderNames.AcceptLanguage);

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
