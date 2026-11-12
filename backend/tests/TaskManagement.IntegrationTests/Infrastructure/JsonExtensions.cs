using System.Net.Http.Json;
using System.Text.Json;

namespace TaskManagement.IntegrationTests.Infrastructure;

public static class JsonExtensions
{
    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    public static string[] Titles(this JsonElement page) =>
        page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("title").GetString()!).ToArray();
}
