using System.Net;
using System.Net.Http.Json;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Users;

[Collection(PostgresCollection.Name)]
public sealed class ProfileEndpointsTests : IDisposable
{
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public ProfileEndpointsTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private static Task<HttpResponseMessage> Put(TestUser user, object body) => user.Client.PutAsJsonAsync("/api/users/profile", body);

    private Task<HttpResponseMessage> Login(string email, string password) =>
        _api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email, password });

    [Fact]
    public async Task Get_profile_returns_the_same_data_as_me()
    {
        var user = await _api.RegisterAsync(fullName: "Lê Văn C");

        var profile = await user.GetJsonAsync("/api/users/profile");
        var me = await user.GetJsonAsync("/api/auth/me");

        Assert.Equal(me.GetRawText(), profile.GetRawText());
        Assert.Equal("Lê Văn C", profile.GetProperty("fullName").GetString());
    }

    [Fact]
    public async Task Updating_only_the_name_needs_no_password_and_bumps_updatedAt()
    {
        var user = await _api.RegisterAsync();
        var before = await user.GetJsonAsync("/api/users/profile");

        var response = await Put(user, new { fullName = "  Tên Mới  ", email = user.Email });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var after = await response.JsonAsync();
        Assert.Equal("Tên Mới", after.GetProperty("fullName").GetString());
        Assert.Equal(user.Email, after.GetProperty("email").GetString());
        Assert.Equal(before.GetProperty("createdAt").GetDateTimeOffset(), after.GetProperty("createdAt").GetDateTimeOffset());
        Assert.True(after.GetProperty("updatedAt").GetDateTimeOffset() > before.GetProperty("updatedAt").GetDateTimeOffset());
        Assert.Equal("Tên Mới", (await user.GetJsonAsync("/api/users/profile")).GetProperty("fullName").GetString());
    }

    [Fact]
    public async Task Writing_the_same_email_in_another_case_is_not_an_email_change()
    {
        var user = await _api.RegisterAsync();

        var response = await Put(user, new { fullName = "An", email = $" {user.Email.ToUpperInvariant()} " });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(user.Email, (await response.JsonAsync()).GetProperty("email").GetString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Wr0ngPassword")]
    public async Task Changing_email_requires_the_correct_current_password(string? currentPassword)
    {
        var user = await _api.RegisterAsync();
        var newEmail = TestApi.UniqueEmail();

        var response = await Put(user, new { fullName = "An", email = newEmail, currentPassword });

        var problem = await response.ReadProblemAsync(400);
        Assert.NotEmpty(problem.ErrorsFor("currentPassword"));
        Assert.Equal(user.Email, (await user.GetJsonAsync("/api/users/profile")).GetProperty("email").GetString());
    }

    [Fact]
    public async Task A_rejected_email_change_does_not_apply_the_name_change_either()
    {
        var user = await _api.RegisterAsync(fullName: "Tên Cũ");

        await Put(user, new { fullName = "Tên Khác", email = TestApi.UniqueEmail(), currentPassword = "Wr0ngPassword" });

        Assert.Equal("Tên Cũ", (await user.GetJsonAsync("/api/users/profile")).GetProperty("fullName").GetString());
    }

    [Fact]
    public async Task Changing_email_with_the_right_password_moves_login_to_the_new_address_and_keeps_the_token_valid()
    {
        var user = await _api.RegisterAsync();
        var newEmail = TestApi.UniqueEmail().ToUpperInvariant();

        var response = await Put(user, new { fullName = "An", email = $" {newEmail} ", currentPassword = user.Password });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(newEmail.ToLowerInvariant(), (await response.JsonAsync()).GetProperty("email").GetString());
        Assert.Equal(HttpStatusCode.OK, (await Login(newEmail, user.Password)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(user.Email, user.Password)).StatusCode);
        // The token identifies the user by id, so an email change does not log them out.
        Assert.Equal(HttpStatusCode.OK, (await user.Client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Taking_another_users_email_is_a_409_and_changes_nothing()
    {
        var alice = await _api.RegisterAsync();
        var bob = await _api.RegisterAsync();

        var response = await Put(bob, new { fullName = "Bob", email = alice.Email.ToUpperInvariant(), currentPassword = bob.Password });

        var problem = await response.ReadProblemAsync(409);
        Assert.Equal(["Email này đã được sử dụng."], problem.ErrorsFor("email"));
        Assert.Equal(bob.Email, (await bob.GetJsonAsync("/api/users/profile")).GetProperty("email").GetString());
        Assert.Equal(HttpStatusCode.OK, (await Login(alice.Email, alice.Password)).StatusCode);
    }

    [Fact]
    public async Task Invalid_profile_data_is_rejected_with_field_errors()
    {
        var user = await _api.RegisterAsync();

        Assert.NotEmpty((await (await Put(user, new { fullName = "   ", email = user.Email })).ReadProblemAsync(400)).ErrorsFor("fullName"));
        Assert.NotEmpty((await (await Put(user, new { fullName = new string('n', 151), email = user.Email })).ReadProblemAsync(400)).ErrorsFor("fullName"));
        Assert.NotEmpty((await (await Put(user, new { fullName = "An", email = "not-an-email" })).ReadProblemAsync(400)).ErrorsFor("email"));
    }

    [Fact]
    public async Task Updating_one_profile_never_touches_another()
    {
        var alice = await _api.RegisterAsync(fullName: "Alice");
        var bob = await _api.RegisterAsync(fullName: "Bob");

        await Put(alice, new { fullName = "Alice Đổi", email = alice.Email });

        Assert.Equal("Bob", (await bob.GetJsonAsync("/api/users/profile")).GetProperty("fullName").GetString());
    }

    [Fact]
    public async Task Profile_endpoints_require_authentication()
    {
        var anonymous = _api.Anonymous();

        await (await anonymous.GetAsync("/api/users/profile")).ReadProblemAsync(401);
        await (await anonymous.PutAsJsonAsync("/api/users/profile", new { fullName = "An", email = "a@b.co" })).ReadProblemAsync(401);
    }
}
