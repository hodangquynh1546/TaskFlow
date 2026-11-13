using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;

namespace TaskManagement.IntegrationTests.Infrastructure;

public sealed class TestUser(Guid id, string email, string password, string token, HttpClient client)
{
    public Guid Id { get; } = id;
    public string Email { get; } = email;
    public string Password { get; } = password;
    public string Token { get; } = token;

    /// <summary>The long-lived token issued at sign-up, for the "stay signed in" flow.</summary>
    public string RefreshToken { get; init; } = string.Empty;

    /// <summary>A client that sends this user's bearer token.</summary>
    public HttpClient Client { get; } = client;

    public async Task<JsonElement> CreateTaskAsync(object body)
    {
        var response = await Client.PostAsJsonAsync("/api/tasks", body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    public async Task<JsonElement> CreateTaskAsync(string title) => await CreateTaskAsync(new { title });

    public async Task<JsonElement> GetJsonAsync(string url, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await Client.GetAsync(url);
        Assert.Equal(expected, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}

public sealed class TestApi(ApiFactory factory, PostgresFixture postgres)
{
    public const string DefaultPassword = "Passw0rd1";

    public HttpClient Anonymous() => factory.CreateClient();

    public async Task<TestUser> RegisterAsync(string? email = null, string password = DefaultPassword, string fullName = "Người Dùng Thử")
    {
        email ??= UniqueEmail();
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { fullName, email, password });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var token = body.GetProperty("accessToken").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return new TestUser(body.GetProperty("user").GetProperty("id").GetGuid(), body.GetProperty("user").GetProperty("email").GetString()!, password, token, client)
        {
            RefreshToken = body.GetProperty("refreshToken").GetString()!,
        };
    }

    public static string UniqueEmail() => $"user-{Guid.NewGuid():N}@example.com";

    /// <summary>Writes a task straight to the database so created/updated/due times can be exact.</summary>
    public async Task<Guid> SeedTaskAsync(
        Guid userId,
        string title,
        TaskItemStatus status = TaskItemStatus.Todo,
        TaskPriority priority = TaskPriority.Medium,
        DateTimeOffset? start = null,
        DateTimeOffset? due = null,
        DateTimeOffset? created = null,
        DateTimeOffset? updated = null,
        int? durationMinutes = null)
    {
        var createdAt = created ?? DateTimeOffset.UtcNow;
        var task = TaskItem.Create(userId, title, null, priority, status, start, due, createdAt, durationMinutes);
        if (updated is { } u && u != createdAt)
        {
            task.ChangeStatus(status, u);
        }

        await using var db = postgres.CreateContext();
        db.Tasks.Add(task);
        await db.SaveChangesAsync();
        return task.Id;
    }

    /// <summary>
    /// Creates <paramref name="count"/> tasks that are identical for sorting purposes, then inserts them in REVERSE id order.
    /// Ids are time-ordered, so without this the physical order would happen to equal the id order and hide a missing tie-breaker.
    /// Returns the titles in ascending id order (as PostgreSQL sorts uuids), which is the order the API must produce for ties.
    /// </summary>
    public async Task<string[]> SeedTiedTasksAsync(Guid userId, int count, DateTimeOffset created, TaskPriority priority = TaskPriority.Medium)
    {
        var tasks = Enumerable.Range(0, count)
            .Select(i => TaskItem.Create(userId, $"tie-{i:00}", null, priority, TaskItemStatus.Todo, null, null, created))
            .ToList();

        await using var db = postgres.CreateContext();
        foreach (var task in Enumerable.Reverse(tasks))
        {
            db.Tasks.Add(task);
        }
        await db.SaveChangesAsync();

        // PostgreSQL orders uuid byte-by-byte from the left, which equals ordinal order of the canonical hex string.
        // .NET's own Guid ordering uses a different byte order, so it must not be used here.
        return tasks.OrderBy(t => t.Id.ToString(), StringComparer.Ordinal).Select(t => t.Title).ToArray();
    }
}
