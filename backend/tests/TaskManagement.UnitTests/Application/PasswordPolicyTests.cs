using TaskManagement.Application.Common;

namespace TaskManagement.UnitTests.Application;

public class PasswordPolicyTests
{
    [Theory]
    [InlineData("Passw0rd")]
    [InlineData("Abcdefg1")]
    [InlineData("mẬtkhẩu1")]          // Vietnamese upper/lower case letters count
    [InlineData("A1 spaces allowed")]
    [InlineData("Aa1!@#$%^&*()")]
    public void Accepts_passwords_meeting_every_requirement(string password)
    {
        Assert.Empty(PasswordPolicy.Check(password));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Blank_password_reports_only_that_it_is_missing(string? password)
    {
        Assert.Equal(["Mật khẩu không được để trống."], PasswordPolicy.Check(password));
    }

    [Theory]
    [InlineData("Pass0rd", "ít nhất 8 ký tự")]     // 7 chars
    [InlineData("passw0rd", "chữ hoa")]
    [InlineData("PASSW0RD", "chữ thường")]
    [InlineData("Password", "chữ số")]
    public void Reports_the_specific_unmet_requirement(string password, string expectedFragment)
    {
        var problems = PasswordPolicy.Check(password);

        Assert.Single(problems);
        Assert.Contains(expectedFragment, problems[0], StringComparison.Ordinal);
    }

    [Fact]
    public void Reports_every_unmet_requirement_at_once()
    {
        var problems = PasswordPolicy.Check("abc"); // has a lower-case letter, lacks everything else

        Assert.Equal(3, problems.Count);
        Assert.Contains(problems, p => p.Contains("8 ký tự", StringComparison.Ordinal));
        Assert.Contains(problems, p => p.Contains("chữ hoa", StringComparison.Ordinal));
        Assert.Contains(problems, p => p.Contains("chữ số", StringComparison.Ordinal));
    }

    [Fact]
    public void Length_boundaries_are_8_and_128()
    {
        Assert.Empty(PasswordPolicy.Check("Aa1" + new string('x', 5)));          // 8
        Assert.NotEmpty(PasswordPolicy.Check("Aa1" + new string('x', 4)));       // 7
        Assert.Empty(PasswordPolicy.Check("Aa1" + new string('x', 125)));        // 128
        Assert.Contains(PasswordPolicy.Check("Aa1" + new string('x', 126)), p => p.Contains("tối đa 128", StringComparison.Ordinal)); // 129
    }
}
