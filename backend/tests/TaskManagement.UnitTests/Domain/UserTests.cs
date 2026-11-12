using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.UnitTests.Domain;

public class UserTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 12, 9, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("  Alice@Example.COM ", "alice@example.com")]
    [InlineData("a@b.co", "a@b.co")]
    public void Email_is_trimmed_and_lowercased(string input, string expected)
    {
        Assert.Equal(expected, User.NormalizeEmail(input));
        Assert.Equal(expected, User.Create("An", input, "hash", Now).Email);
    }

    [Fact]
    public void Create_trims_full_name_and_stamps_both_times()
    {
        var user = User.Create("  Nguyễn Văn A  ", "a@b.co", "hash", Now);

        Assert.Equal("Nguyễn Văn A", user.FullName);
        Assert.Equal(Now, user.CreatedAt);
        Assert.Equal(Now, user.UpdatedAt);
        Assert.NotEqual(Guid.Empty, user.Id);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Blank_full_name_is_rejected(string name)
    {
        Assert.Equal("fullName", Assert.Throws<DomainException>(() => User.Create(name, "a@b.co", "hash", Now)).Field);
    }

    [Fact]
    public void Full_name_limit_is_150()
    {
        Assert.NotNull(User.Create(new string('n', 150), "a@b.co", "hash", Now));
        Assert.Throws<DomainException>(() => User.Create(new string('n', 151), "a@b.co", "hash", Now));
    }

    [Fact]
    public void Email_limit_is_255()
    {
        var exactly255 = new string('a', 255 - "@b.co".Length) + "@b.co";

        Assert.Equal(255, User.Create("An", exactly255, "hash", Now).Email.Length);
        Assert.Throws<DomainException>(() => User.Create("An", exactly255 + "x", "hash", Now));
    }

    [Fact]
    public void Password_hash_is_required()
    {
        Assert.Throws<DomainException>(() => User.Create("An", "a@b.co", " ", Now));
    }

    [Fact]
    public void UpdateProfile_changes_fields_and_updated_time_only()
    {
        var user = User.Create("An", "a@b.co", "hash", Now);
        var later = Now.AddHours(1);

        user.UpdateProfile("Bình", "B@C.co", later);

        Assert.Equal("Bình", user.FullName);
        Assert.Equal("b@c.co", user.Email);
        Assert.Equal(later, user.UpdatedAt);
        Assert.Equal(Now, user.CreatedAt);
    }

    [Fact]
    public void ChangePasswordHash_replaces_hash()
    {
        var user = User.Create("An", "a@b.co", "old", Now);

        user.ChangePasswordHash("new", Now.AddMinutes(5));

        Assert.Equal("new", user.PasswordHash);
    }
}
