using System.Net;
using System.Text.Json;
using TaskManagement.Domain.Enums;
using TaskManagement.IntegrationTests.Infrastructure;

namespace TaskManagement.IntegrationTests.Tasks;

[Collection(PostgresCollection.Name)]
public sealed class TaskQueryTests : IDisposable
{
    private readonly FrozenClock _clock = new();
    private readonly ApiFactory _factory;
    private readonly TestApi _api;

    public TaskQueryTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres.ConnectionString, clock: _clock);
        _api = new TestApi(_factory, postgres);
    }

    public void Dispose() => _factory.Dispose();

    private DateTimeOffset Now => _clock.Now;

    private static string Q(params (string Key, string Value)[] pairs) =>
        "/api/tasks?" + string.Join('&', pairs.Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));

    private static string Iso(DateTimeOffset value) => value.ToString("O", System.Globalization.CultureInfo.InvariantCulture);

    private static Task<JsonElement> Page(TestUser user, params (string, string)[] query) => user.GetJsonAsync(Q(query));

    // --- Defaults and response shape -------------------------------------------------------------

    [Fact]
    public async Task Default_listing_is_newest_first_page_1_of_10_with_paging_metadata()
    {
        var user = await _api.RegisterAsync();
        for (var i = 0; i < 12; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"T{i:00}", created: Now.AddMinutes(-i));
        }

        var first = await Page(user);
        var second = await Page(user, ("page", "2"));

        Assert.Equal(1, first.GetProperty("page").GetInt32());
        Assert.Equal(10, first.GetProperty("pageSize").GetInt32());
        Assert.Equal(12, first.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, first.GetProperty("totalPages").GetInt32());
        Assert.Equal(Enumerable.Range(0, 10).Select(i => $"T{i:00}"), first.Titles());
        Assert.Equal(["T10", "T11"], second.Titles());
    }

    [Fact]
    public async Task A_user_with_no_tasks_gets_an_empty_page_not_an_error()
    {
        var user = await _api.RegisterAsync();

        var page = await Page(user);

        Assert.Empty(page.GetProperty("items").EnumerateArray());
        Assert.Equal(0, page.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, page.GetProperty("totalPages").GetInt32());
    }

    // --- Sorting ---------------------------------------------------------------------------------

    [Fact]
    public async Task Sort_by_created_date_in_both_directions()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "middle", created: Now.AddHours(-2));
        await _api.SeedTaskAsync(user.Id, "oldest", created: Now.AddHours(-3));
        await _api.SeedTaskAsync(user.Id, "newest", created: Now.AddHours(-1));

        Assert.Equal(["oldest", "middle", "newest"], (await Page(user, ("sortBy", "createdAt"), ("sortDir", "asc"))).Titles());
        Assert.Equal(["newest", "middle", "oldest"], (await Page(user, ("sortBy", "createdAt"), ("sortDir", "desc"))).Titles());
    }

    [Fact]
    public async Task Sort_by_due_date_puts_tasks_without_a_due_date_last_in_both_directions()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "d3", due: Now.AddDays(3), created: Now.AddMinutes(-5));
        await _api.SeedTaskAsync(user.Id, "none-a", created: Now.AddMinutes(-4));
        await _api.SeedTaskAsync(user.Id, "d1", due: Now.AddDays(1), created: Now.AddMinutes(-3));
        await _api.SeedTaskAsync(user.Id, "none-b", created: Now.AddMinutes(-2));
        await _api.SeedTaskAsync(user.Id, "d2", due: Now.AddDays(2), created: Now.AddMinutes(-1));

        var asc = (await Page(user, ("sortBy", "dueDate"), ("sortDir", "asc"))).Titles();
        var desc = (await Page(user, ("sortBy", "dueDate"), ("sortDir", "desc"))).Titles();

        Assert.Equal(["d1", "d2", "d3"], asc.Take(3));
        Assert.Equal(["d3", "d2", "d1"], desc.Take(3));
        Assert.Equal(["none-a", "none-b"], asc.Skip(3).Order());
        Assert.Equal(["none-a", "none-b"], desc.Skip(3).Order());
    }

    [Fact]
    public async Task Sort_by_start_time_orders_the_day_and_breaks_ties_by_deadline_with_unscheduled_tasks_last()
    {
        var user = await _api.RegisterAsync();
        var day = Now.AddDays(1);
        await _api.SeedTaskAsync(user.Id, "13th-12h", start: day.AddHours(4), created: Now.AddMinutes(-9));
        await _api.SeedTaskAsync(user.Id, "unscheduled", created: Now.AddMinutes(-8));
        await _api.SeedTaskAsync(user.Id, "13th-08h-late", start: day, due: day.AddDays(3), created: Now.AddMinutes(-7));
        await _api.SeedTaskAsync(user.Id, "14th-08h", start: day.AddDays(1), created: Now.AddMinutes(-6));
        await _api.SeedTaskAsync(user.Id, "13th-08h-early", start: day, due: day.AddDays(1), created: Now.AddMinutes(-5));

        var asc = (await Page(user, ("sortBy", "startDate"), ("sortDir", "asc"))).Titles();

        Assert.Equal(["13th-08h-early", "13th-08h-late", "13th-12h", "14th-08h", "unscheduled"], asc);
    }

    [Theory]
    [InlineData("createdAt", "asc")]
    [InlineData("createdAt", "desc")]
    [InlineData("startDate", "asc")]
    [InlineData("dueDate", "desc")]
    [InlineData("priority", "desc")]
    public async Task Finished_tasks_sink_below_open_ones_whatever_the_sort(string sortBy, string sortDir)
    {
        var user = await _api.RegisterAsync();
        // The finished tasks would come first in every one of these orders if status did not matter.
        await _api.SeedTaskAsync(user.Id, "done-early", TaskItemStatus.Completed, TaskPriority.High, start: Now.AddHours(1), due: Now.AddDays(1), created: Now.AddMinutes(-9));
        await _api.SeedTaskAsync(user.Id, "done-late", TaskItemStatus.Completed, TaskPriority.High, start: Now.AddHours(2), due: Now.AddDays(2), created: Now.AddMinutes(-1));
        await _api.SeedTaskAsync(user.Id, "open-a", TaskItemStatus.Todo, TaskPriority.Low, start: Now.AddDays(5), due: Now.AddDays(6), created: Now.AddMinutes(-8));
        await _api.SeedTaskAsync(user.Id, "open-b", TaskItemStatus.InProgress, TaskPriority.Low, start: Now.AddDays(7), due: Now.AddDays(8), created: Now.AddMinutes(-2));

        var titles = (await Page(user, ("sortBy", sortBy), ("sortDir", sortDir))).Titles();

        Assert.Equal(["open-a", "open-b"], titles.Take(2).Order());
        Assert.Equal(["done-early", "done-late"], titles.Skip(2).Order());
    }

    [Fact]
    public async Task Finished_tasks_come_last_across_pages_too_not_just_within_one_page()
    {
        var user = await _api.RegisterAsync();
        for (var i = 0; i < 3; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"done-{i}", TaskItemStatus.Completed, created: Now.AddMinutes(-30 + i));
            await _api.SeedTaskAsync(user.Id, $"open-{i}", TaskItemStatus.Todo, created: Now.AddMinutes(-60 + i));
        }

        var first = (await Page(user, ("pageSize", "3"), ("page", "1"), ("sortBy", "createdAt"), ("sortDir", "desc"))).Titles();
        var second = (await Page(user, ("pageSize", "3"), ("page", "2"), ("sortBy", "createdAt"), ("sortDir", "desc"))).Titles();

        Assert.All(first, t => Assert.StartsWith("open-", t));
        Assert.All(second, t => Assert.StartsWith("done-", t));
    }

    [Fact]
    public async Task Sort_by_priority_orders_by_importance_then_newest_first()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "low", priority: TaskPriority.Low, created: Now.AddMinutes(-9));
        await _api.SeedTaskAsync(user.Id, "high-old", priority: TaskPriority.High, created: Now.AddMinutes(-8));
        await _api.SeedTaskAsync(user.Id, "med", priority: TaskPriority.Medium, created: Now.AddMinutes(-7));
        await _api.SeedTaskAsync(user.Id, "high-new", priority: TaskPriority.High, created: Now.AddMinutes(-1));

        Assert.Equal(["low", "med", "high-new", "high-old"], (await Page(user, ("sortBy", "priority"), ("sortDir", "asc"))).Titles());
        Assert.Equal(["high-new", "high-old", "med", "low"], (await Page(user, ("sortBy", "priority"), ("sortDir", "desc"))).Titles());
    }

    [Fact]
    public async Task Sort_and_direction_names_are_case_insensitive()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "a", created: Now.AddHours(-2));
        await _api.SeedTaskAsync(user.Id, "b", created: Now.AddHours(-1));

        Assert.Equal(["a", "b"], (await Page(user, ("sortBy", "CREATEDAT"), ("sortDir", "ASC"))).Titles());
    }

    // --- Pagination ------------------------------------------------------------------------------

    [Fact]
    public async Task Paging_through_rows_with_identical_sort_values_neither_repeats_nor_skips_anything()
    {
        var user = await _api.RegisterAsync();
        var sameInstant = Now.AddHours(-1);
        for (var i = 0; i < 25; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"same-{i:00}", priority: TaskPriority.High, created: sameInstant);
        }

        foreach (var sortBy in new[] { "createdAt", "priority", "dueDate" })
        {
            var seen = new List<string>();
            for (var page = 1; page <= 3; page++)
            {
                seen.AddRange((await Page(user, ("sortBy", sortBy), ("pageSize", "10"), ("page", page.ToString(System.Globalization.CultureInfo.InvariantCulture)))).Titles());
            }

            Assert.Equal(25, seen.Count);
            Assert.Equal(25, seen.Distinct().Count());
        }
    }

    [Theory]
    [InlineData("createdAt", "asc")]
    [InlineData("createdAt", "desc")]
    [InlineData("priority", "asc")]
    [InlineData("priority", "desc")]
    [InlineData("dueDate", "asc")]
    [InlineData("dueDate", "desc")]
    public async Task Ties_are_broken_by_id_so_every_sort_is_fully_deterministic(string sortBy, string sortDir)
    {
        var user = await _api.RegisterAsync();
        var expected = await _api.SeedTiedTasksAsync(user.Id, 23, Now.AddHours(-1));

        var seen = new List<string>();
        for (var page = 1; page <= 3; page++)
        {
            seen.AddRange((await Page(user, ("sortBy", sortBy), ("sortDir", sortDir), ("pageSize", "10"), ("page", page.ToString(System.Globalization.CultureInfo.InvariantCulture)))).Titles());
        }

        Assert.Equal(expected, seen);
    }

    [Fact]
    public async Task The_same_request_always_returns_the_same_order()
    {
        var user = await _api.RegisterAsync();
        for (var i = 0; i < 15; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"t{i}", created: Now.AddHours(-1));
        }

        var first = (await Page(user, ("pageSize", "15"))).Titles();
        var second = (await Page(user, ("pageSize", "15"))).Titles();

        Assert.Equal(first, second);
    }

    [Fact]
    public async Task A_page_beyond_the_end_is_an_empty_list_with_the_correct_totals()
    {
        var user = await _api.RegisterAsync();
        for (var i = 0; i < 3; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"t{i}");
        }

        var page = await Page(user, ("page", "99"));

        Assert.Empty(page.GetProperty("items").EnumerateArray());
        Assert.Equal(3, page.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, page.GetProperty("totalPages").GetInt32());
        Assert.Equal(99, page.GetProperty("page").GetInt32());
    }

    [Fact]
    public async Task Page_size_boundaries_1_and_50_work()
    {
        var user = await _api.RegisterAsync();
        for (var i = 0; i < 3; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"t{i}");
        }

        Assert.Single((await Page(user, ("pageSize", "1"))).GetProperty("items").EnumerateArray());
        Assert.Equal(3, (await Page(user, ("pageSize", "50"))).GetProperty("items").GetArrayLength());
    }

    // --- Search ----------------------------------------------------------------------------------

    [Theory]
    [InlineData("báo", "Viết BÁO cáo tuần")]
    [InlineData("BÁO CÁO", "Viết báo cáo tuần")]
    [InlineData("  báo cáo  ", "Viết báo cáo tuần")]
    [InlineData("tuần", "Viết báo cáo tuần")]
    [InlineData("đi chợ", "ĐI CHỢ mua rau")]
    [InlineData("đi", "ĐI CHỢ mua rau")]
    [InlineData("ĐI", "đi chợ mua rau")]
    [InlineData("ế", "Kết thúc dự án")]
    public async Task Search_matches_substrings_ignoring_case_and_keeping_vietnamese_diacritics(string term, string title)
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, title);
        await _api.SeedTaskAsync(user.Id, "Một việc hoàn toàn khác");

        var page = await Page(user, ("search", term));

        Assert.Equal([title], page.Titles());
    }

    [Fact]
    public async Task Search_does_not_conflate_letters_with_and_without_diacritics()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "dien thoai");
        await _api.SeedTaskAsync(user.Id, "điện thoại");

        Assert.Equal(["điện thoại"], (await Page(user, ("search", "điện"))).Titles());
        Assert.Equal(["dien thoai"], (await Page(user, ("search", "dien"))).Titles());
    }

    [Theory]
    [InlineData("%", new[] { "giảm 50% giá" })]
    [InlineData("50%", new[] { "giảm 50% giá" })]
    [InlineData("_", new[] { "file_name" })]
    [InlineData("a_e", new string[0])]            // would match "ame" if '_' were a wildcard
    [InlineData("\\", new[] { "C:\\temp" })]
    [InlineData("%%", new string[0])]
    public async Task Wildcard_characters_in_the_search_term_are_taken_literally(string term, string[] expected)
    {
        var user = await _api.RegisterAsync();
        foreach (var title in new[] { "giảm 50% giá", "file_name", "C:\\temp", "đơn giản" })
        {
            await _api.SeedTaskAsync(user.Id, title);
        }

        Assert.Equal(expected.Order(), (await Page(user, ("search", term))).Titles().Order());
    }

    [Fact]
    public async Task Sql_metacharacters_in_search_are_just_text()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "bình thường");

        var injection = await Page(user, ("search", "'; DROP TABLE \"Tasks\"; --"));
        var tautology = await Page(user, ("search", "' OR '1'='1"));

        Assert.Equal(0, injection.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, tautology.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, (await Page(user)).GetProperty("totalCount").GetInt32()); // table intact, row intact
    }

    [Fact]
    public async Task A_blank_search_applies_no_filter()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "a");
        await _api.SeedTaskAsync(user.Id, "b");

        Assert.Equal(2, (await Page(user, ("search", "   "))).GetProperty("totalCount").GetInt32());
        Assert.Equal(2, (await Page(user, ("search", ""))).GetProperty("totalCount").GetInt32());
    }

    // --- Filters ---------------------------------------------------------------------------------

    [Theory]
    [InlineData("Todo", new[] { "todo-1", "todo-2" })]
    [InlineData("InProgress", new[] { "doing" })]
    [InlineData("Completed", new[] { "done" })]
    public async Task Filter_by_status(string status, string[] expected)
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "todo-1", TaskItemStatus.Todo);
        await _api.SeedTaskAsync(user.Id, "todo-2", TaskItemStatus.Todo);
        await _api.SeedTaskAsync(user.Id, "doing", TaskItemStatus.InProgress);
        await _api.SeedTaskAsync(user.Id, "done", TaskItemStatus.Completed);

        Assert.Equal(expected.Order(), (await Page(user, ("status", status))).Titles().Order());
    }

    [Theory]
    [InlineData("Low", new[] { "low" })]
    [InlineData("Medium", new[] { "med" })]
    [InlineData("High", new[] { "high-1", "high-2" })]
    public async Task Filter_by_priority(string priority, string[] expected)
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "low", priority: TaskPriority.Low);
        await _api.SeedTaskAsync(user.Id, "med", priority: TaskPriority.Medium);
        await _api.SeedTaskAsync(user.Id, "high-1", priority: TaskPriority.High);
        await _api.SeedTaskAsync(user.Id, "high-2", priority: TaskPriority.High);

        Assert.Equal(expected.Order(), (await Page(user, ("priority", priority))).Titles().Order());
    }

    [Fact]
    public async Task Due_date_range_is_inclusive_at_both_ends_and_excludes_tasks_without_a_due_date()
    {
        var user = await _api.RegisterAsync();
        var from = Now.AddDays(2);
        var to = Now.AddDays(4);
        await _api.SeedTaskAsync(user.Id, "before", due: from.AddSeconds(-1));
        await _api.SeedTaskAsync(user.Id, "at-from", due: from);
        await _api.SeedTaskAsync(user.Id, "inside", due: Now.AddDays(3));
        await _api.SeedTaskAsync(user.Id, "at-to", due: to);
        await _api.SeedTaskAsync(user.Id, "after", due: to.AddSeconds(1));
        await _api.SeedTaskAsync(user.Id, "no-due");

        var both = await Page(user, ("dueFrom", Iso(from)), ("dueTo", Iso(to)));
        var onlyFrom = await Page(user, ("dueFrom", Iso(from)));
        var onlyTo = await Page(user, ("dueTo", Iso(from)));

        Assert.Equal(["at-from", "at-to", "inside"], both.Titles().Order());
        Assert.Equal(["after", "at-from", "at-to", "inside"], onlyFrom.Titles().Order());
        Assert.Equal(["at-from", "before"], onlyTo.Titles().Order());
    }

    [Fact]
    public async Task Due_range_accepts_offsets_and_compares_instants()
    {
        var user = await _api.RegisterAsync();
        var due = Now.AddDays(1);
        await _api.SeedTaskAsync(user.Id, "target", due: due);

        var sameInstantInVietnamTime = due.ToOffset(TimeSpan.FromHours(7));
        var page = await Page(user, ("dueFrom", Iso(sameInstantInVietnamTime)), ("dueTo", Iso(sameInstantInVietnamTime)));

        Assert.Equal(["target"], page.Titles());
    }

    [Fact]
    public async Task Overdue_means_due_strictly_before_now_and_not_completed()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "late-todo", due: Now.AddSeconds(-1));
        await _api.SeedTaskAsync(user.Id, "late-doing", TaskItemStatus.InProgress, due: Now.AddDays(-5));
        await _api.SeedTaskAsync(user.Id, "late-done", TaskItemStatus.Completed, due: Now.AddDays(-5));
        await _api.SeedTaskAsync(user.Id, "due-exactly-now", due: Now);
        await _api.SeedTaskAsync(user.Id, "future", due: Now.AddSeconds(1));
        await _api.SeedTaskAsync(user.Id, "no-due");

        var overdue = await Page(user, ("overdue", "true"));

        Assert.Equal(["late-doing", "late-todo"], overdue.Titles().Order());
        Assert.All(overdue.GetProperty("items").EnumerateArray(), i => Assert.True(i.GetProperty("isOverdue").GetBoolean()));
    }

    [Fact]
    public async Task Overdue_false_does_not_filter_anything()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "late", due: Now.AddDays(-1));
        await _api.SeedTaskAsync(user.Id, "fine", due: Now.AddDays(1));

        Assert.Equal(2, (await Page(user, ("overdue", "false"))).GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Overdue_combined_with_completed_is_an_empty_but_valid_result()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "late", due: Now.AddDays(-1));
        await _api.SeedTaskAsync(user.Id, "late-done", TaskItemStatus.Completed, due: Now.AddDays(-1));

        var page = await Page(user, ("overdue", "true"), ("status", "Completed"));

        Assert.Equal(0, page.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task All_filters_combine_with_AND_and_total_count_reflects_the_filtered_set()
    {
        var user = await _api.RegisterAsync();
        await _api.SeedTaskAsync(user.Id, "Báo cáo quý", TaskItemStatus.InProgress, TaskPriority.High, due: Now.AddDays(2));
        await _api.SeedTaskAsync(user.Id, "Báo cáo tháng", TaskItemStatus.InProgress, TaskPriority.Low, due: Now.AddDays(2));
        await _api.SeedTaskAsync(user.Id, "Báo cáo năm", TaskItemStatus.Todo, TaskPriority.High, due: Now.AddDays(2));
        await _api.SeedTaskAsync(user.Id, "Họp nhóm", TaskItemStatus.InProgress, TaskPriority.High, due: Now.AddDays(2));
        await _api.SeedTaskAsync(user.Id, "Báo cáo muộn", TaskItemStatus.InProgress, TaskPriority.High, due: Now.AddDays(9));

        var page = await Page(user,
            ("search", "báo cáo"), ("status", "InProgress"), ("priority", "High"),
            ("dueFrom", Iso(Now.AddDays(1))), ("dueTo", Iso(Now.AddDays(3))));

        Assert.Equal(["Báo cáo quý"], page.Titles());
        Assert.Equal(1, page.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Filtering_then_paging_counts_only_matching_rows()
    {
        var user = await _api.RegisterAsync();
        for (var i = 0; i < 7; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"match-{i}", TaskItemStatus.Completed, created: Now.AddMinutes(-i));
        }
        for (var i = 0; i < 5; i++)
        {
            await _api.SeedTaskAsync(user.Id, $"other-{i}");
        }

        var page2 = await Page(user, ("status", "Completed"), ("pageSize", "5"), ("page", "2"));

        Assert.Equal(7, page2.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, page2.GetProperty("totalPages").GetInt32());
        Assert.Equal(["match-5", "match-6"], page2.Titles());
    }

    // --- Invalid input ---------------------------------------------------------------------------

    [Theory]
    [InlineData("page", "0", "page")]
    [InlineData("page", "-1", "page")]
    [InlineData("page", "100001", "page")]
    [InlineData("page", "abc", "page")]
    [InlineData("pageSize", "0", "pageSize")]
    [InlineData("pageSize", "51", "pageSize")]
    [InlineData("pageSize", "-5", "pageSize")]
    [InlineData("sortBy", "title", "sortBy")]
    [InlineData("sortDir", "up", "sortDir")]
    [InlineData("status", "Done", "status")]
    [InlineData("status", "7", "status")]
    [InlineData("priority", "Urgent", "priority")]
    [InlineData("priority", "9", "priority")]
    [InlineData("dueFrom", "yesterday", "dueFrom")]
    [InlineData("dueTo", "2030-13-45", "dueTo")]
    [InlineData("overdue", "maybe", "overdue")]
    public async Task Invalid_query_values_are_rejected_with_400_naming_the_parameter(string key, string value, string field)
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.GetAsync(Q((key, value)));

        var problem = await response.ReadProblemAsync(400);
        Assert.NotEmpty(problem.ErrorsFor(field));
    }

    [Fact]
    public async Task An_inverted_due_range_is_rejected()
    {
        var user = await _api.RegisterAsync();

        var response = await user.Client.GetAsync(Q(("dueFrom", Iso(Now.AddDays(2))), ("dueTo", Iso(Now.AddDays(1)))));

        Assert.NotEmpty((await response.ReadProblemAsync(400)).ErrorsFor("dueFrom"));
    }

    [Fact]
    public async Task An_overlong_search_term_is_rejected_but_200_characters_is_fine()
    {
        var user = await _api.RegisterAsync();

        Assert.Equal(HttpStatusCode.OK, (await user.Client.GetAsync(Q(("search", new string('s', 200))))).StatusCode);
        Assert.NotEmpty((await (await user.Client.GetAsync(Q(("search", new string('s', 201))))).ReadProblemAsync(400)).ErrorsFor("search"));
    }
}
