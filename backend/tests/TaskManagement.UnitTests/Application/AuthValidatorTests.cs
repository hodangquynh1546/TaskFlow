using TaskManagement.Application.Auth;
using TaskManagement.Application.Users;

namespace TaskManagement.UnitTests.Application;

public class AuthValidatorTests
{
    private readonly RegisterRequestValidator _register = new();
    private readonly LoginRequestValidator _login = new();
    private readonly ChangePasswordRequestValidator _change = new();
    private readonly UpdateProfileRequestValidator _profile = new();

    // --- Register --------------------------------------------------------------------------------

    [Fact]
    public void Register_accepts_a_valid_request()
    {
        ValidationAssert.Valid(_register, new RegisterRequest("Nguyễn Văn A", "a@example.com", "Passw0rd"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Register_rejects_blank_name(string name)
    {
        ValidationAssert.InvalidOn(_register, new RegisterRequest(name, "a@example.com", "Passw0rd"), "FullName");
    }

    [Fact]
    public void Register_name_limit_is_150_after_trimming()
    {
        ValidationAssert.Valid(_register, new RegisterRequest("  " + new string('n', 150) + "  ", "a@example.com", "Passw0rd"));
        ValidationAssert.InvalidOn(_register, new RegisterRequest(new string('n', 151), "a@example.com", "Passw0rd"), "FullName");
    }

    [Theory]
    [InlineData("")]
    [InlineData("plainaddress")]
    [InlineData("@no-local.com")]
    [InlineData("no-domain@")]
    [InlineData("no-dot@domain")]
    [InlineData("two@@example.com")]
    [InlineData("white space@example.com")]
    public void Register_rejects_malformed_emails(string email)
    {
        ValidationAssert.InvalidOn(_register, new RegisterRequest("An", email, "Passw0rd"), "Email");
    }

    [Theory]
    [InlineData("a@b.co")]
    [InlineData("first.last+tag@sub.example.com")]
    public void Register_accepts_normal_emails(string email)
    {
        ValidationAssert.Valid(_register, new RegisterRequest("An", email, "Passw0rd"));
    }

    [Fact]
    public void Register_email_limit_is_255()
    {
        var ok = new string('a', 255 - "@b.co".Length) + "@b.co";

        ValidationAssert.Valid(_register, new RegisterRequest("An", ok, "Passw0rd"));
        ValidationAssert.InvalidOn(_register, new RegisterRequest("An", ok + "x", "Passw0rd"), "Email");
    }

    [Fact]
    public void Register_applies_the_password_policy_and_reports_all_failures_under_Password()
    {
        var errors = ValidationAssert.Errors(_register, new RegisterRequest("An", "a@example.com", "abc"));

        Assert.Equal(3, errors["Password"].Length);
    }

    // --- Login -----------------------------------------------------------------------------------

    [Fact]
    public void Login_does_not_enforce_the_password_policy()
    {
        // A weak legacy password must still reach the credential check and fail there with the generic message.
        ValidationAssert.Valid(_login, new LoginRequest("a@example.com", "x"));
    }

    [Fact]
    public void Login_requires_both_fields_and_caps_password_length()
    {
        ValidationAssert.InvalidOn(_login, new LoginRequest("", "x"), "Email");
        ValidationAssert.InvalidOn(_login, new LoginRequest("a@b.co", ""), "Password");
        ValidationAssert.InvalidOn(_login, new LoginRequest("a@b.co", new string('x', 129)), "Password");
    }

    // --- Change password -------------------------------------------------------------------------

    [Fact]
    public void ChangePassword_requires_current_and_a_policy_compliant_new_password()
    {
        ValidationAssert.Valid(_change, new ChangePasswordRequest("old", "NewPassw0rd"));
        ValidationAssert.InvalidOn(_change, new ChangePasswordRequest("", "NewPassw0rd"), "CurrentPassword");
        ValidationAssert.InvalidOn(_change, new ChangePasswordRequest("old", "weak"), "NewPassword");
    }

    // --- Profile ---------------------------------------------------------------------------------

    [Fact]
    public void Profile_update_validates_name_and_email_and_allows_missing_current_password()
    {
        ValidationAssert.Valid(_profile, new UpdateProfileRequest("An", "a@b.co", null));
        ValidationAssert.InvalidOn(_profile, new UpdateProfileRequest("", "a@b.co", null), "FullName");
        ValidationAssert.InvalidOn(_profile, new UpdateProfileRequest("An", "bad", null), "Email");
        ValidationAssert.InvalidOn(_profile, new UpdateProfileRequest("An", "a@b.co", new string('x', 129)), "CurrentPassword");
    }
}
