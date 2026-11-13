using System.Net;
using System.Text.Json;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Tasks;

/// <summary>The title box offers titles the user has typed before, narrowing as they type.</summary>
[Collection(PostgresCollection.Name)]
public sealed class TitleSuggestionsTests : IDisposable
{
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public TitleSuggestionsTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private static async Task<string[]> Suggest(TestUser user, string prefix, int? limit = null) =>
        (await user.GetJsonAsync($"/api/tasks/title-suggestions?prefix={Uri.EscapeDataString(prefix)}" + (limit is null ? "" : $"&limit={limit}")))
            .EnumerateArray().Select(e => e.GetString()!).ToArray();

    private async Task<TestUser> UserWithTitles(params string[] titles)
    {
        var user = await _api.RegisterAsync();
        foreach (var title in titles)
        {
            await _api.SeedTaskAsync(user.Id, title);
        }

        return user;
    }

    [Fact]
    public async Task Typing_narrows_the_offers_by_prefix()
    {
        var user = await UserWithTitles("đã dạy", "động", "đen", "học");

        var offers = (await Suggest(user, "đ")).Order(StringComparer.Ordinal).ToList();
        Assert.Equal(3, offers.Count);
        Assert.All(offers, o => Assert.StartsWith("đ", o, StringComparison.Ordinal));
        Assert.DoesNotContain("học", offers);
        Assert.Equal(["đã dạy"], await Suggest(user, "đã"));
        Assert.Equal(["học"], await Suggest(user, "h"));
        Assert.Empty(await Suggest(user, "x"));
    }

    [Fact]
    public async Task The_match_ignores_case_but_not_accents()
    {
        var user = await UserWithTitles("Đã dạy", "dạy học");

        Assert.Equal(["Đã dạy"], await Suggest(user, "đ"));
        Assert.Equal(["Đã dạy"], await Suggest(user, "ĐÃ"));
        Assert.Equal(["dạy học"], await Suggest(user, "d"));
    }

    [Fact]
    public async Task A_title_used_more_often_comes_first_and_each_title_is_offered_once()
    {
        var user = await UserWithTitles("Họp tuần", "Họp nhóm", "Họp nhóm", "Họp nhóm", "họp nhóm", "Họp tuần");

        var offers = await Suggest(user, "họp");

        Assert.Equal(2, offers.Length);
        Assert.Equal("Họp nhóm", offers[0], ignoreCase: true);
    }

    [Fact]
    public async Task The_limit_is_respected()
    {
        var user = await UserWithTitles("a1", "a2", "a3", "a4");

        Assert.Equal(2, (await Suggest(user, "a", limit: 2)).Length);
    }

    [Theory]
    [InlineData("%")]
    [InlineData("_")]
    public async Task Wildcard_characters_match_only_themselves(string typed)
    {
        var user = await UserWithTitles("100% xong", "việc thường");

        var offers = await Suggest(user, typed);

        Assert.Empty(offers);
        Assert.Equal(["100% xong"], await Suggest(user, "100%"));
    }

    [Fact]
    public async Task Empty_or_blank_text_offers_nothing()
    {
        var user = await UserWithTitles("a");

        Assert.Empty(await Suggest(user, ""));
        Assert.Empty(await Suggest(user, "   "));
    }

    [Fact]
    public async Task Only_the_users_own_titles_are_offered()
    {
        var mine = await UserWithTitles("Việc của tôi");
        await UserWithTitles("Việc bí mật của người khác");

        Assert.Equal(["Việc của tôi"], await Suggest(mine, "việc"));
    }

    [Theory]
    [InlineData("limit=0")]
    [InlineData("limit=21")]
    public async Task Bad_limits_are_a_400(string query)
    {
        var user = await UserWithTitles("a");

        await (await user.Client.GetAsync($"/api/tasks/title-suggestions?prefix=a&{query}")).ReadProblemAsync(400);
    }

    [Fact]
    public async Task Signing_in_is_required()
    {
        var response = await _api.Anonymous().GetAsync("/api/tasks/title-suggestions?prefix=a");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
