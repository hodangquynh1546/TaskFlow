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
