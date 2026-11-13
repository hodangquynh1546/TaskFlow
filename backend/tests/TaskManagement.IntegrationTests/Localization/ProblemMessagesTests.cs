using Microsoft.AspNetCore.Http;
using TaskManagement.API.Localization;

namespace TaskManagement.IntegrationTests.Localization;

public sealed class ProblemMessagesTests
{
    private static ResponseLanguage Resolve(string? header)
    {
        var context = new DefaultHttpContext();
        if (header is not null)
        {
            context.Request.Headers.AcceptLanguage = header;
        }

        return ProblemMessages.Resolve(context.Request);
    }

    [Theory]
    [InlineData(null, ResponseLanguage.Vietnamese)]
    [InlineData("vi", ResponseLanguage.Vietnamese)]
    [InlineData("vi-VN,vi;q=0.9,en;q=0.8", ResponseLanguage.Vietnamese)]
    [InlineData("en", ResponseLanguage.English)]
    [InlineData("en-US,en;q=0.9,vi;q=0.8", ResponseLanguage.English)]
    [InlineData("vi;q=0.5, en;q=0.9", ResponseLanguage.English)]
    [InlineData("fr-FR,fr;q=0.9,en;q=0.5", ResponseLanguage.English)]
    [InlineData("fr-FR", ResponseLanguage.Vietnamese)]
    [InlineData("*", ResponseLanguage.Vietnamese)]
    [InlineData("en;q=0, vi", ResponseLanguage.Vietnamese)]
    [InlineData("not a language header ;;", ResponseLanguage.Vietnamese)]
    [InlineData("ja", ResponseLanguage.Japanese)]
    [InlineData("ja-JP,ja;q=0.9,en;q=0.5", ResponseLanguage.Japanese)]
    [InlineData("zh-CN,zh;q=0.9", ResponseLanguage.Chinese)]
    [InlineData("zh-TW", ResponseLanguage.Chinese)]
    [InlineData("en;q=0.4, ja;q=0.8", ResponseLanguage.Japanese)]
    public void Accept_Language_picks_the_best_supported_language_and_defaults_to_the_source_language(string? header, ResponseLanguage expected)
    {
        Assert.Equal(expected, Resolve(header));
    }

    [Theory]
    [InlineData("Email hoặc mật khẩu không đúng.", "Incorrect email or password.")]
    [InlineData("Mật khẩu phải có ít nhất 8 ký tự.", "The password needs at least 8 characters.")]
    [InlineData("Thời lượng phải từ 1 đến 1440 phút.", "Duration must be 1 to 1440 minutes.")]
    [InlineData("Tiêu đề tối đa 200 ký tự.", "Title can be at most 200 characters.")]
    [InlineData("Trang phải từ 1 đến 100000.", "Page must be 1 to 100000.")]
    public void Known_messages_are_translated_including_the_numbers_they_carry(string vietnamese, string english)
    {
        Assert.Equal(english, ProblemMessages.Translate(vietnamese, ResponseLanguage.English));
    }

    [Theory]
    [InlineData(ResponseLanguage.Japanese, "メールアドレスまたはパスワードが正しくありません。", "パスワードは8文字以上で入力してください。", "所要時間は1〜1440分にしてください。")]
    [InlineData(ResponseLanguage.Chinese, "邮箱或密码不正确。", "密码至少需要 8 个字符。", "时长必须为 1 到 1440 分钟。")]
    public void Japanese_and_Chinese_translate_exact_messages_and_the_numbers_in_them(ResponseLanguage language, string exact, string withNumber, string minutes)
    {
        Assert.Equal(exact, ProblemMessages.Translate("Email hoặc mật khẩu không đúng.", language));
        Assert.Equal(withNumber, ProblemMessages.Translate("Mật khẩu phải có ít nhất 8 ký tự.", language));
        Assert.Equal(minutes, ProblemMessages.Translate("Thời lượng phải từ 1 đến 1440 phút.", language));
    }

    [Theory]
    [InlineData(ResponseLanguage.Japanese, 404, "見つかりません")]
    [InlineData(ResponseLanguage.Chinese, 404, "未找到")]
    [InlineData(ResponseLanguage.Japanese, 418, "リクエストに失敗しました")]
    [InlineData(ResponseLanguage.Chinese, 418, "请求失败")]
    public void Titles_exist_in_Japanese_and_Chinese(ResponseLanguage language, int status, string expected)
    {
        Assert.Equal(expected, ProblemMessages.TitleFor(status, "Không tìm thấy", language));
    }

    [Fact]
    public void Vietnamese_is_never_rewritten()
    {
        Assert.Equal("Email này đã được sử dụng.", ProblemMessages.Translate("Email này đã được sử dụng.", ResponseLanguage.Vietnamese));
    }

    [Fact]
    public void An_unknown_message_is_left_alone_rather_than_guessed()
    {
        Assert.Null(ProblemMessages.TryTranslate("Một lỗi chưa từng thấy."));
        Assert.Equal("Một lỗi chưa từng thấy.", ProblemMessages.Translate("Một lỗi chưa từng thấy.", ResponseLanguage.English));
    }

    [Theory]
    [InlineData(400, "Dữ liệu không hợp lệ", "Invalid data")]
    [InlineData(404, "Không tìm thấy", "Not found")]
    [InlineData(429, "Quá nhiều yêu cầu", "Too many requests")]
    [InlineData(418, "Yêu cầu không thành công", "Request failed")]
    public void Titles_follow_the_language(int status, string vietnamese, string english)
    {
        Assert.Equal(english, ProblemMessages.TitleFor(status, vietnamese, ResponseLanguage.English));
        Assert.Equal(vietnamese, ProblemMessages.TitleFor(status, vietnamese, ResponseLanguage.Vietnamese));
    }
}
