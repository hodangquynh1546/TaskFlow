using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using TaskManagement.Application.Abstractions;
using TaskManagement.Domain.Entities;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Pipeline;

[Collection(PostgresCollection.Name)]
public sealed class AuthenticationPipelineTests(PostgresFixture postgres) : IDisposable
{
    private static readonly string[] ExpectedClaims = ["aud", "exp", "iat", "iss", "jti", "nbf", "sub"];

    private readonly ApiFactory _factory = new(postgres.ConnectionString);

    public void Dispose() => _factory.Dispose();

    private HttpClient ClientWith(string? token)
    {
        var client = _factory.CreateClient();
        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }

    [Fact]
    public async Task Health_is_public()
    {
        var response = await ClientWith(null).GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Protected_endpoint_without_token_returns_401_problem()
    {
        var response = await ClientWith(null).GetAsync("/test/me");

        await response.ReadProblemAsync(401);
    }

    [Fact]
    public async Task Unknown_route_is_also_401_for_anonymous_callers()
    {
        // The fallback policy makes every route private by default, so route probing reveals nothing.
        var response = await ClientWith(null).GetAsync("/api/does-not-exist");

        await response.ReadProblemAsync(401);
    }

    [Fact]
    public async Task Token_issued_by_the_real_service_authenticates_and_carries_the_subject()
    {
        var user = User.Create("An", "a@example.com", "hash", DateTimeOffset.UtcNow);
        var token = _factory.Services.GetRequiredService<IJwtTokenService>().Create(user);

        var response = await ClientWith(token.Value).GetAsync("/test/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(user.Id, body.GetProperty("userId").GetGuid());
    }

    [Fact]
    public void Issued_token_contains_only_the_expected_claims_and_expires_in_60_minutes()
    {
        var user = User.Create("An", "secret-email@example.com", "hash", DateTimeOffset.UtcNow);
        var before = DateTimeOffset.UtcNow;

        var token = _factory.Services.GetRequiredService<IJwtTokenService>().Create(user);

        var jwt = new JsonWebTokenHandler().ReadJsonWebToken(token.Value);
        var names = jwt.Claims.Select(c => c.Type).OrderBy(n => n).ToArray();
        Assert.Equal(ExpectedClaims, names);
        Assert.Equal(user.Id.ToString(), jwt.Subject);
        Assert.Equal(ApiFactory.Issuer, jwt.Issuer);
        Assert.Contains(ApiFactory.Audience, jwt.Audiences);
        Assert.DoesNotContain("secret-email", token.Value, StringComparison.Ordinal);
        Assert.InRange(token.ExpiresAt, before.AddMinutes(59), before.AddMinutes(61).AddSeconds(5));
        Assert.Equal(new DateTimeOffset(jwt.ValidTo, TimeSpan.Zero), token.ExpiresAt, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public void Each_token_has_a_unique_id()
    {
        var user = User.Create("An", "a@example.com", "hash", DateTimeOffset.UtcNow);
        var service = _factory.Services.GetRequiredService<IJwtTokenService>();

        var ids = Enumerable.Range(0, 5).Select(_ => new JsonWebTokenHandler().ReadJsonWebToken(service.Create(user).Value).Id);

        Assert.Equal(5, ids.Distinct().Count());
    }

    public static TheoryData<string, string> BadTokens() => new()
    {
        { "expired a minute ago", TestTokens.Create(Guid.NewGuid().ToString(), expiresIn: TimeSpan.FromMinutes(-1)) },
        { "signed with another key", TestTokens.Create(Guid.NewGuid().ToString(), key: "a-completely-different-signing-key-0123456789!!") },
        { "wrong issuer", TestTokens.Create(Guid.NewGuid().ToString(), issuer: "someone-else") },
        { "wrong audience", TestTokens.Create(Guid.NewGuid().ToString(), audience: "someone-else") },
        { "unexpected algorithm HS512", TestTokens.Create(Guid.NewGuid().ToString(), key: ApiFactory.JwtKey + ApiFactory.JwtKey, algorithm: SecurityAlgorithms.HmacSha512) },
        { "garbage", "not.a.jwt" },
    };

    [Theory]
    [MemberData(nameof(BadTokens))]
    public async Task Invalid_token_is_rejected_with_401(string reason, string token)
    {
        var response = await ClientWith(token).GetAsync("/test/me");

        await response.ReadProblemAsync(401);
        Assert.False(string.IsNullOrEmpty(reason));
    }

    [Fact]
    public async Task Tampered_signature_is_rejected()
    {
        var token = TestTokens.Create(Guid.NewGuid().ToString());
        var flipped = token[..^2] + (token[^2] == 'A' ? 'B' : 'A') + token[^1];

        var response = await ClientWith(flipped).GetAsync("/test/me");

        await response.ReadProblemAsync(401);
    }

    [Fact]
    public async Task Token_expired_within_clock_skew_is_accepted_but_not_beyond()
    {
        var recently = await ClientWith(TestTokens.Create(Guid.NewGuid().ToString(), expiresIn: TimeSpan.FromSeconds(-10))).GetAsync("/test/me");
        var longAgo = await ClientWith(TestTokens.Create(Guid.NewGuid().ToString(), expiresIn: TimeSpan.FromSeconds(-90))).GetAsync("/test/me");

        Assert.Equal(HttpStatusCode.OK, recently.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, longAgo.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not-a-guid")]
    public async Task Validly_signed_token_without_a_usable_subject_is_401_not_500(string? subject)
    {
        var response = await ClientWith(TestTokens.Create(subject)).GetAsync("/test/me");

        await response.ReadProblemAsync(401);
    }

    [Fact]
    public void Password_hasher_salts_verifies_and_never_stores_plaintext()
    {
        var hasher = _factory.Services.GetRequiredService<IPasswordHasher>();

        var first = hasher.Hash("Passw0rd!x");
        var second = hasher.Hash("Passw0rd!x");

        Assert.NotEqual(first, second);
        Assert.DoesNotContain("Passw0rd", first, StringComparison.Ordinal);
        Assert.True(hasher.Verify(first, "Passw0rd!x"));
        Assert.True(hasher.Verify(second, "Passw0rd!x"));
        Assert.False(hasher.Verify(first, "passw0rd!x"));
        Assert.False(hasher.Verify(first, ""));
    }

    [Fact]
    public void Password_hasher_treats_a_malformed_stored_hash_as_a_failed_match()
    {
        var hasher = _factory.Services.GetRequiredService<IPasswordHasher>();

        Assert.False(hasher.Verify("not-a-valid-hash", "whatever"));
    }

    [Fact]
    public async Task Signing_key_from_test_config_is_what_the_server_uses()
    {
        // Guards the test rig itself: if UseSetting stopped reaching Program, every token test would pass for the wrong reason.
        var user = User.Create("An", "a@example.com", "hash", DateTimeOffset.UtcNow);
        var token = _factory.Services.GetRequiredService<IJwtTokenService>().Create(user).Value;

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidIssuer = ApiFactory.Issuer,
            ValidAudience = ApiFactory.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(ApiFactory.JwtKey)),
        });

        Assert.True(result.IsValid);
    }
}
