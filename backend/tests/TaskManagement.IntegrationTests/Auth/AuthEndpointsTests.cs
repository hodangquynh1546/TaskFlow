using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TaskManagement.Application.Abstractions;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Auth;

[Collection(PostgresCollection.Name)]
public sealed class AuthEndpointsTests : IDisposable
{
    private readonly PostgresFixture _postgres;
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public AuthEndpointsTests(PostgresFixture postgres)
    {
        _postgres = postgres;
        _factory = new ApiFactory(postgres.ConnectionString);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private Task<HttpResponseMessage> RegisterRaw(object body) => _api.Anonymous().PostAsJsonAsync("/api/auth/register", body);

    private Task<HttpResponseMessage> LoginRaw(string email, string password) =>
        _api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email, password });

    // --- Register --------------------------------------------------------------------------------

    [Fact]
    public async Task Register_creates_the_account_and_returns_a_working_token_and_user()
    {
        var email = TestApi.UniqueEmail();

        var response = await RegisterRaw(new { fullName = "Nguyễn Văn A", email, password = "Passw0rd1" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.JsonAsync();
        Assert.Equal(email, body.GetProperty("user").GetProperty("email").GetString());
        Assert.Equal("Nguyễn Văn A", body.GetProperty("user").GetProperty("fullName").GetString());
        Assert.True(body.GetProperty("expiresAt").GetDateTimeOffset() > DateTimeOffset.UtcNow.AddMinutes(55));

        var me = _api.Anonymous();
        me.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.OK, (await me.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Register_response_never_contains_password_or_hash()
    {
        var response = await RegisterRaw(new { fullName = "An", email = TestApi.UniqueEmail(), password = "Passw0rd1" });

        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("password", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hash", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Register_stores_only_a_salted_hash_that_verifies()
    {
        var email = TestApi.UniqueEmail();
        await RegisterRaw(new { fullName = "An", email, password = "Passw0rd1" });

        await using var db = _postgres.CreateContext();
        var stored = await db.Users.AsNoTracking().SingleAsync(u => u.Email == email);

        Assert.DoesNotContain("Passw0rd1", stored.PasswordHash, StringComparison.Ordinal);
        Assert.True(_factory.Services.GetRequiredService<IPasswordHasher>().Verify(stored.PasswordHash, "Passw0rd1"));
    }

    [Fact]
    public async Task Register_normalises_email_and_trims_name()
    {
        var local = Guid.NewGuid().ToString("N");

        var response = await RegisterRaw(new { fullName = "  An Bình  ", email = $"  {local}@Example.COM ", password = "Passw0rd1" });

        var user = (await response.JsonAsync()).GetProperty("user");
        Assert.Equal($"{local}@example.com", user.GetProperty("email").GetString());
        Assert.Equal("An Bình", user.GetProperty("fullName").GetString());
    }

    [Theory]
    [InlineData("{0}@EXAMPLE.com")]
    [InlineData("  {0}@example.com  ")]
    public async Task Register_rejects_a_duplicate_email_however_it_is_written(string variant)
    {
        var local = Guid.NewGuid().ToString("N");
        await _api.RegisterAsync($"{local}@example.com");

        var response = await RegisterRaw(new { fullName = "Khác", email = variant.Replace("{0}", local, StringComparison.Ordinal), password = "Passw0rd1" });

        var problem = await response.ReadProblemAsync(409);
        Assert.Equal(["Email này đã được sử dụng."], problem.ErrorsFor("email"));
        await using var db = _postgres.CreateContext();
        Assert.Equal(1, await db.Users.CountAsync(u => u.Email == $"{local}@example.com"));
    }

    [Fact]
    public async Task Concurrent_registrations_of_one_email_produce_exactly_one_account_and_no_server_errors()
    {
        var email = TestApi.UniqueEmail();

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            RegisterRaw(new { fullName = "An", email, password = "Passw0rd1" })));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(7, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        await using var db = _postgres.CreateContext();
        Assert.Equal(1, await db.Users.CountAsync(u => u.Email == email));
    }

    [Theory]
    [InlineData("weak", "password")]
    [InlineData("alllowercase1", "password")]
    [InlineData("NoDigitsHere", "password")]
    [InlineData("", "password")]
    public async Task Register_rejects_passwords_that_break_the_policy(string password, string field)
    {
        var response = await RegisterRaw(new { fullName = "An", email = TestApi.UniqueEmail(), password });

        var problem = await response.ReadProblemAsync(400);
        Assert.NotEmpty(problem.ErrorsFor(field));
    }

    [Fact]
    public async Task Register_reports_every_unmet_password_requirement_together()
    {
        var response = await RegisterRaw(new { fullName = "An", email = TestApi.UniqueEmail(), password = "abc" });

        var problem = await response.ReadProblemAsync(400);
        Assert.Equal(3, problem.ErrorsFor("password").Length);
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("")]
    [InlineData("a@b")]
    public async Task Register_rejects_invalid_emails(string email)
    {
        var response = await RegisterRaw(new { fullName = "An", email, password = "Passw0rd1" });

        Assert.NotEmpty((await response.ReadProblemAsync(400)).ErrorsFor("email"));
    }

    [Fact]
    public async Task Register_rejects_blank_and_overlong_names()
    {
        var blank = await RegisterRaw(new { fullName = "   ", email = TestApi.UniqueEmail(), password = "Passw0rd1" });
        var tooLong = await RegisterRaw(new { fullName = new string('n', 151), email = TestApi.UniqueEmail(), password = "Passw0rd1" });

        Assert.NotEmpty((await blank.ReadProblemAsync(400)).ErrorsFor("fullName"));
        Assert.NotEmpty((await tooLong.ReadProblemAsync(400)).ErrorsFor("fullName"));
    }

    [Fact]
    public async Task Register_with_an_empty_object_is_a_400_not_a_500()
    {
        var response = await RegisterRaw(new { });

        await response.ReadProblemAsync(400);
    }

    [Fact]
    public async Task A_rejected_registration_creates_no_account()
    {
        var email = TestApi.UniqueEmail();
        await RegisterRaw(new { fullName = "An", email, password = "weak" });

        await using var db = _postgres.CreateContext();
        Assert.False(await db.Users.AnyAsync(u => u.Email == email));
    }

    // --- Login -----------------------------------------------------------------------------------

    [Fact]
    public async Task Login_succeeds_and_the_token_authenticates()
    {
        var user = await _api.RegisterAsync();

        var response = await LoginRaw(user.Email, user.Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.JsonAsync();
        Assert.Equal(user.Id, body.GetProperty("user").GetProperty("id").GetGuid());
        var client = _api.Anonymous();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Login_ignores_email_case_and_surrounding_spaces()
    {
        var user = await _api.RegisterAsync();

        var response = await LoginRaw($"  {user.Email.ToUpperInvariant()} ", user.Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Wrong_password_and_unknown_email_are_indistinguishable()
    {
        var user = await _api.RegisterAsync();

        var wrongPassword = await (await LoginRaw(user.Email, "Wr0ngPassword")).ReadProblemAsync(401);
        var unknownEmail = await (await LoginRaw(TestApi.UniqueEmail(), "Wr0ngPassword")).ReadProblemAsync(401);

        Assert.Equal("Email hoặc mật khẩu không đúng.", wrongPassword.GetProperty("detail").GetString());
        Assert.Equal(wrongPassword.GetProperty("detail").GetString(), unknownEmail.GetProperty("detail").GetString());
        Assert.Equal(wrongPassword.GetProperty("title").GetString(), unknownEmail.GetProperty("title").GetString());
        Assert.False(wrongPassword.TryGetProperty("errors", out _));
        Assert.False(unknownEmail.TryGetProperty("errors", out _));
    }

    [Fact]
    public async Task Login_with_a_weak_password_is_a_401_not_a_policy_error()
    {
        var user = await _api.RegisterAsync();

        var response = await LoginRaw(user.Email, "x");

        await response.ReadProblemAsync(401);
    }

    [Fact]
    public async Task Login_requires_both_fields()
    {
        Assert.NotEmpty((await (await LoginRaw("", "x")).ReadProblemAsync(400)).ErrorsFor("email"));
        Assert.NotEmpty((await (await LoginRaw("a@b.co", "")).ReadProblemAsync(400)).ErrorsFor("password"));
    }

    [Fact]
    public async Task Each_login_issues_a_distinct_token()
    {
        var user = await _api.RegisterAsync();

        var first = (await (await LoginRaw(user.Email, user.Password)).JsonAsync()).GetProperty("accessToken").GetString();
        var second = (await (await LoginRaw(user.Email, user.Password)).JsonAsync()).GetProperty("accessToken").GetString();

        Assert.NotEqual(first, second);
    }

    [Fact]
    public async Task Failed_logins_are_logged_without_the_email_or_password()
    {
        var logs = new CapturingLoggerProvider();
        using var factory = _factory.WithWebHostBuilder(b => b.ConfigureServices(s => s.AddLogging(l => l.AddProvider(logs))));
        var email = TestApi.UniqueEmail();

        await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { email, password = "SuperSecret9" });

        var entry = Assert.Single(logs.Entries, e => e.Message.Contains("Login failed", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.DoesNotContain(logs.Entries, e => e.Message.Contains(email, StringComparison.Ordinal) || e.Message.Contains("SuperSecret9", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Login_and_register_are_rate_limited_per_client()
    {
        using var limited = _factory.WithWebHostBuilder(b => b.UseSetting("RateLimiting:AuthPermitPerMinute", "3"));
        var client = limited.CreateClient();

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new { email = "a@b.co", password = "x" })).StatusCode);
        }

        await (await client.PostAsJsonAsync("/api/auth/login", new { email = "a@b.co", password = "x" })).ReadProblemAsync(429);
        // The budget is shared by login and register, so a flood of registrations is throttled too.
        await (await client.PostAsJsonAsync("/api/auth/register", new { fullName = "An", email = TestApi.UniqueEmail(), password = "Passw0rd1" })).ReadProblemAsync(429);
    }

    // --- Me / logout -----------------------------------------------------------------------------

    [Fact]
    public async Task Me_returns_the_current_user()
    {
        var user = await _api.RegisterAsync(fullName: "Trần Thị B");

        var me = await user.GetJsonAsync("/api/auth/me");

        Assert.Equal(user.Id, me.GetProperty("id").GetGuid());
        Assert.Equal("Trần Thị B", me.GetProperty("fullName").GetString());
        Assert.Equal(user.Email, me.GetProperty("email").GetString());
        Assert.False(me.TryGetProperty("passwordHash", out _));
    }

    [Fact]
    public async Task Me_without_a_token_is_401()
    {
        await (await _api.Anonymous().GetAsync("/api/auth/me")).ReadProblemAsync(401);
    }

    [Fact]
    public async Task Me_for_a_token_whose_user_no_longer_exists_is_401()
    {
        var user = await _api.RegisterAsync();
        await using (var db = _postgres.CreateContext())
        {
            await db.Users.Where(u => u.Id == user.Id).ExecuteDeleteAsync();
        }

        await (await user.Client.GetAsync("/api/auth/me")).ReadProblemAsync(401);
    }

    [Fact]
    public async Task Logout_always_answers_204_even_with_no_body_or_an_unknown_token()
    {
        var user = await _api.RegisterAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await user.Client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _api.Anonymous().PostAsJsonAsync("/api/auth/logout", new { refreshToken = "never-issued" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _api.Anonymous().PostAsJsonAsync("/api/auth/logout", new { refreshToken = new string('x', 5000) })).StatusCode);
    }

    [Fact]
    public async Task An_access_token_stays_valid_after_logout_until_it_expires()
    {
        // Access tokens are stateless (ADR-05): logout ends the refresh token, so the session cannot be renewed.
        var user = await _api.RegisterAsync();
        await _api.Anonymous().PostAsJsonAsync("/api/auth/logout", new { refreshToken = user.RefreshToken });

        Assert.Equal(HttpStatusCode.OK, (await user.Client.GetAsync("/api/auth/me")).StatusCode);
    }

    // --- Change password -------------------------------------------------------------------------

    [Fact]
    public async Task Change_password_switches_the_credentials()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = user.Password, newPassword = "NewPassw0rd2" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await LoginRaw(user.Email, "NewPassw0rd2")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginRaw(user.Email, user.Password)).StatusCode);
    }

    [Fact]
    public async Task Change_password_does_not_invalidate_existing_tokens()
    {
        // Known, documented limitation (ADR-05).
        var user = await _api.RegisterAsync();
        await user.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = user.Password, newPassword = "NewPassw0rd2" });

        Assert.Equal(HttpStatusCode.OK, (await user.Client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Change_password_with_the_wrong_current_password_is_400_and_changes_nothing()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = "Wr0ngPassword", newPassword = "NewPassw0rd2" });

        var problem = await response.ReadProblemAsync(400);
        Assert.Equal(["Mật khẩu hiện tại không đúng."], problem.ErrorsFor("currentPassword"));
        Assert.Equal(HttpStatusCode.OK, (await LoginRaw(user.Email, user.Password)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginRaw(user.Email, "NewPassw0rd2")).StatusCode);
    }

    [Fact]
    public async Task Change_password_rejects_reusing_the_current_password()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = user.Password, newPassword = user.Password });

        Assert.NotEmpty((await response.ReadProblemAsync(400)).ErrorsFor("newPassword"));
    }

    [Fact]
    public async Task Change_password_enforces_the_policy_on_the_new_password()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = user.Password, newPassword = "weak" });

        Assert.NotEmpty((await response.ReadProblemAsync(400)).ErrorsFor("newPassword"));
        Assert.Equal(HttpStatusCode.OK, (await LoginRaw(user.Email, user.Password)).StatusCode);
    }

    [Fact]
    public async Task Change_password_requires_authentication()
    {
        var response = await _api.Anonymous().PostAsJsonAsync("/api/auth/change-password", new { currentPassword = "a", newPassword = "NewPassw0rd2" });

        await response.ReadProblemAsync(401);
    }

    [Fact]
    public async Task Changing_one_users_password_does_not_affect_another()
    {
        var alice = await _api.RegisterAsync();
        var bob = await _api.RegisterAsync();

        await alice.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = alice.Password, newPassword = "NewPassw0rd2" });

        Assert.Equal(HttpStatusCode.OK, (await LoginRaw(bob.Email, bob.Password)).StatusCode);
    }
}
