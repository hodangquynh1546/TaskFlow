using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Auth;

/// <summary>"Stay signed in": a long-lived refresh token that is rotated on every use and dies if a copy is replayed.</summary>
[Collection(PostgresCollection.Name)]
public sealed class RefreshTokenTests : IDisposable
{
    private readonly FrozenClock _clock = new();
    private readonly PostgresFixture _postgres;
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public RefreshTokenTests(PostgresFixture postgres)
    {
        _postgres = postgres;
        _factory = new ApiFactory(postgres.ConnectionString, clock: _clock);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private Task<HttpResponseMessage> Refresh(string? token) => _api.Anonymous().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = token });

    private static async Task<(string Access, string Refresh)> Pair(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return (body.GetProperty("accessToken").GetString()!, body.GetProperty("refreshToken").GetString()!);
    }

    [Fact]
    public async Task Sign_up_and_sign_in_each_start_a_session_with_its_own_refresh_token()
    {
        var user = await _api.RegisterAsync();

        var login = await _api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = user.Password });
        var (_, second) = await Pair(login);

        Assert.False(string.IsNullOrWhiteSpace(user.RefreshToken));
        Assert.NotEqual(user.RefreshToken, second);
    }

    [Fact]
    public async Task Only_a_hash_of_the_token_is_stored_never_the_token()
    {
        var user = await _api.RegisterAsync();

        await using var db = _postgres.CreateContext();
        var stored = await db.RefreshTokens.Where(t => t.UserId == user.Id).ToListAsync();

        Assert.Single(stored);
        Assert.NotEqual(user.RefreshToken, stored[0].TokenHash);
        Assert.Equal(64, stored[0].TokenHash.Length);
    }

    [Fact]
    public async Task Refreshing_returns_a_working_access_token_and_a_new_refresh_token()
    {
        var user = await _api.RegisterAsync();

        var (access, refresh) = await Pair(await Refresh(user.RefreshToken));

        Assert.NotEqual(user.RefreshToken, refresh);
        var client = _api.Anonymous();
        client.DefaultRequestHeaders.Authorization = new("Bearer", access);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task The_new_refresh_token_keeps_working_so_a_device_can_stay_signed_in_indefinitely()
    {
        var user = await _api.RegisterAsync();
        var token = user.RefreshToken;

        for (var i = 0; i < 4; i++)
        {
            _clock.Advance(TimeSpan.FromDays(60)); // longer than the lifetime in total, but never idle for 90 days
            token = (await Pair(await Refresh(token))).Refresh;
        }

        Assert.Equal(HttpStatusCode.OK, (await Refresh(token)).StatusCode);
    }

    [Fact]
    public async Task A_token_unused_for_longer_than_its_lifetime_expires()
    {
        var user = await _api.RegisterAsync();

        _clock.Advance(TimeSpan.FromDays(91));

        await (await Refresh(user.RefreshToken)).ReadProblemAsync(401);
    }

    [Fact]
    public async Task Replaying_an_old_token_straight_away_is_tolerated_as_two_tabs_racing()
    {
        var user = await _api.RegisterAsync();
        await Pair(await Refresh(user.RefreshToken));

        _clock.Advance(TimeSpan.FromSeconds(10));

        Assert.Equal(HttpStatusCode.OK, (await Refresh(user.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Replaying_an_old_token_later_is_theft_and_ends_the_whole_session_including_the_newest_token()
    {
        var user = await _api.RegisterAsync();
        var (_, newest) = await Pair(await Refresh(user.RefreshToken));

        _clock.Advance(TimeSpan.FromMinutes(5));

        await (await Refresh(user.RefreshToken)).ReadProblemAsync(401);
        await (await Refresh(newest)).ReadProblemAsync(401);
    }

    [Fact]
    public async Task Theft_on_one_device_does_not_sign_out_the_users_other_devices()
    {
        var user = await _api.RegisterAsync();
        var other = await Pair(await _api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = user.Password }));
        await Pair(await Refresh(user.RefreshToken));
        _clock.Advance(TimeSpan.FromMinutes(5));
        await Refresh(user.RefreshToken); // replay: kills the first device's family

        Assert.Equal(HttpStatusCode.OK, (await Refresh(other.Refresh)).StatusCode);
    }

    [Theory]
    [InlineData("never-issued")]
    [InlineData("")]
    [InlineData(null)]
    public async Task An_unknown_or_missing_token_is_refused(string? token)
    {
        var response = await Refresh(token);

        if (string.IsNullOrEmpty(token))
        {
            await response.ReadProblemAsync(400);
        }
        else
        {
            await response.ReadProblemAsync(401);
        }
    }

    [Fact]
    public async Task An_oversized_token_is_a_400_not_a_database_lookup()
    {
        await (await Refresh(new string('x', 5000))).ReadProblemAsync(400);
    }

    [Fact]
    public async Task Logging_out_ends_the_session_so_it_can_no_longer_be_renewed()
    {
        var user = await _api.RegisterAsync();
        var (_, rotated) = await Pair(await Refresh(user.RefreshToken));

        await _api.Anonymous().PostAsJsonAsync("/api/auth/logout", new { refreshToken = rotated });

        await (await Refresh(rotated)).ReadProblemAsync(401);
        _clock.Advance(TimeSpan.FromSeconds(5));
        await (await Refresh(user.RefreshToken)).ReadProblemAsync(401); // the whole family, not just the newest token
    }

    [Fact]
    public async Task Logging_out_one_device_leaves_the_others_signed_in()
    {
        var user = await _api.RegisterAsync();
        var other = await Pair(await _api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = user.Password }));

        await _api.Anonymous().PostAsJsonAsync("/api/auth/logout", new { refreshToken = user.RefreshToken });

        Assert.Equal(HttpStatusCode.OK, (await Refresh(other.Refresh)).StatusCode);
    }

    [Fact]
    public async Task Changing_the_password_signs_out_other_devices_but_not_this_one()
    {
        var user = await _api.RegisterAsync();
        var otherDevice = await Pair(await _api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = user.Password }));

        var change = await user.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = user.Password, newPassword = "NewPassw0rd2", refreshToken = user.RefreshToken });

        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);
        await (await Refresh(otherDevice.Refresh)).ReadProblemAsync(401);
        Assert.Equal(HttpStatusCode.OK, (await Refresh(user.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Changing_the_password_without_naming_this_device_signs_out_every_device()
    {
        var user = await _api.RegisterAsync();

        await user.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = user.Password, newPassword = "NewPassw0rd2" });

        await (await Refresh(user.RefreshToken)).ReadProblemAsync(401);
    }

    [Fact]
    public async Task Someone_elses_refresh_token_does_not_protect_this_users_other_sessions()
    {
        var user = await _api.RegisterAsync();
        var stranger = await _api.RegisterAsync();
        var second = await Pair(await _api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = user.Password }));

        await user.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = user.Password, newPassword = "NewPassw0rd2", refreshToken = stranger.RefreshToken });

        await (await Refresh(second.Refresh)).ReadProblemAsync(401);
        Assert.Equal(HttpStatusCode.OK, (await Refresh(stranger.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Deleting_the_account_removes_its_refresh_tokens()
    {
        var user = await _api.RegisterAsync();

        await using (var db = _postgres.CreateContext())
        {
            await db.Users.Where(u => u.Id == user.Id).ExecuteDeleteAsync();
            Assert.Empty(await db.RefreshTokens.Where(t => t.UserId == user.Id).ToListAsync());
        }

        await (await Refresh(user.RefreshToken)).ReadProblemAsync(401);
    }

    [Fact]
    public async Task Old_dead_tokens_are_cleaned_up_at_the_next_sign_in()
    {
        var user = await _api.RegisterAsync();
        _clock.Advance(TimeSpan.FromDays(200)); // expired long ago

        await _api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = user.Password });

        await using var db = _postgres.CreateContext();
        Assert.Single(await db.RefreshTokens.Where(t => t.UserId == user.Id).ToListAsync());
    }

    [Fact]
    public async Task The_refresh_error_is_translated()
    {
        var client = _api.Anonymous();
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("ja");

        var problem = await (await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = "never-issued" })).ReadProblemAsync(401);

        Assert.Equal("セッションの有効期限が切れました。もう一度ログインしてください。", problem.GetProperty("detail").GetString());
    }
}
