using TaskManagement.Application.Dashboard;
using TaskManagement.Application.Tasks;
using TaskManagement.Domain.Enums;

namespace TaskManagement.UnitTests.Application;

public class TaskValidatorTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 12, 9, 0, 0, TimeSpan.Zero);

    private readonly CreateTaskRequestValidator _create = new();
    private readonly UpdateTaskRequestValidator _update = new();
    private readonly ChangeStatusRequestValidator _status = new();
    private readonly TaskQueryValidator _query = new();

    private static CreateTaskRequest Create(
        string title = "Việc",
        string? description = null,
        TaskPriority? priority = null,
        TaskItemStatus? status = null,
        DateTimeOffset? start = null,
        DateTimeOffset? due = null) => new(title, description, priority, status, start, due);

    private static UpdateTaskRequest Update(
        string title = "Việc",
        string? description = null,
        TaskPriority? priority = TaskPriority.Medium,
        TaskItemStatus? status = TaskItemStatus.Todo,
        DateTimeOffset? start = null,
        DateTimeOffset? due = null) => new(title, description, priority, status, start, due);

    // --- Create ----------------------------------------------------------------------------------

    [Fact]
    public void Create_accepts_minimal_and_full_requests()
    {
        ValidationAssert.Valid(_create, Create());
        ValidationAssert.Valid(_create, Create("Đầy đủ", "mô tả", TaskPriority.High, TaskItemStatus.InProgress, T0, T0.AddDays(1)));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_title(string title)
    {
        ValidationAssert.InvalidOn(_create, Create(title: title), "Title");
    }

    [Fact]
    public void Title_limit_is_200_measured_after_trimming()
    {
        ValidationAssert.Valid(_create, Create(title: new string('a', 200)));
        ValidationAssert.Valid(_create, Create(title: "  " + new string('a', 200) + "  "));
        ValidationAssert.InvalidOn(_create, Create(title: new string('a', 201)), "Title");
    }

    [Fact]
    public void Description_limit_is_5000()
    {
        ValidationAssert.Valid(_create, Create(description: new string('d', 5000)));
        ValidationAssert.InvalidOn(_create, Create(description: new string('d', 5001)), "Description");
    }

    [Fact]
    public void Create_rejects_undefined_enum_values_but_allows_omitting_them()
    {
        ValidationAssert.InvalidOn(_create, Create(priority: (TaskPriority)9), "Priority");
        ValidationAssert.InvalidOn(_create, Create(status: (TaskItemStatus)(-3)), "Status");
        ValidationAssert.Valid(_create, Create(priority: null, status: null));
    }

    [Fact]
    public void Start_after_due_is_rejected_and_equal_or_partial_dates_are_fine()
    {
        ValidationAssert.InvalidOn(_create, Create(start: T0.AddSeconds(1), due: T0), "StartDate");
        ValidationAssert.Valid(_create, Create(start: T0, due: T0));
        ValidationAssert.Valid(_create, Create(start: T0));
        ValidationAssert.Valid(_create, Create(due: T0));
    }

    [Fact]
    public void Date_order_is_judged_by_instant_not_by_clock_digits()
    {
        var startLate = new DateTimeOffset(2026, 11, 12, 10, 0, 0, TimeSpan.FromHours(7)); // 03:00Z
        var dueEarly = new DateTimeOffset(2026, 11, 12, 5, 0, 0, TimeSpan.Zero);           // 05:00Z

        ValidationAssert.Valid(_create, Create(start: startLate, due: dueEarly));
    }

    // --- Duration ---------------------------------------------------------------------------------

    [Theory]
    [InlineData(1, true)]
    [InlineData(15, true)]
    [InlineData(1440, true)]
    [InlineData(0, false)]
    [InlineData(-10, false)]
    [InlineData(1441, false)]
    public void Duration_bounds_on_create_and_update(int minutes, bool valid)
    {
        var onCreate = ValidationAssert.Errors(_create, new CreateTaskRequest("Việc", null, null, null, null, null, minutes));
        var onUpdate = ValidationAssert.Errors(_update, new UpdateTaskRequest("Việc", null, TaskPriority.Low, TaskItemStatus.Todo, null, null, minutes));

        Assert.Equal(valid, onCreate.Count == 0);
        Assert.Equal(valid, onUpdate.Count == 0);
        if (!valid)
        {
            Assert.Contains("DurationMinutes", onCreate.Keys);
            Assert.Contains("DurationMinutes", onUpdate.Keys);
        }
    }

    [Fact]
    public void Duration_may_be_omitted()
    {
        ValidationAssert.Valid(_create, new CreateTaskRequest("Việc", null, null, null, null, null));
        ValidationAssert.Valid(_update, new UpdateTaskRequest("Việc", null, TaskPriority.Low, TaskItemStatus.Todo, null, null));
    }

    [Fact]
    public void Query_rejects_an_inverted_start_range_but_allows_equal_and_open_ended()
    {
        ValidationAssert.InvalidOn(_query, new TaskQuery { StartFrom = T0.AddSeconds(1), StartTo = T0 }, "StartFrom");
        ValidationAssert.Valid(_query, new TaskQuery { StartFrom = T0, StartTo = T0 });
        ValidationAssert.Valid(_query, new TaskQuery { StartFrom = T0 });
        ValidationAssert.Valid(_query, new TaskQuery { StartTo = T0 });
    }

    [Fact]
    public void Query_accepts_the_start_date_sort_field()
    {
        ValidationAssert.Valid(_query, new TaskQuery { SortBy = TaskSortField.StartDate });
    }

    // --- Update (PUT replaces everything; nothing may be silently defaulted) ---------------------

    [Fact]
    public void Update_requires_priority_and_status_instead_of_defaulting_them()
    {
        ValidationAssert.InvalidOn(_update, Update(priority: null), "Priority");
        ValidationAssert.InvalidOn(_update, Update(status: null), "Status");
        ValidationAssert.Valid(_update, Update());
    }

    [Fact]
    public void Update_applies_the_same_title_description_and_date_rules()
    {
        ValidationAssert.InvalidOn(_update, Update(title: " "), "Title");
        ValidationAssert.InvalidOn(_update, Update(description: new string('d', 5001)), "Description");
        ValidationAssert.InvalidOn(_update, Update(start: T0.AddDays(1), due: T0), "StartDate");
        ValidationAssert.InvalidOn(_update, Update(priority: (TaskPriority)5), "Priority");
        ValidationAssert.InvalidOn(_update, Update(status: (TaskItemStatus)5), "Status");
    }

    // --- Status ----------------------------------------------------------------------------------

    [Theory]
    [InlineData(TaskItemStatus.Todo)]
    [InlineData(TaskItemStatus.InProgress)]
    [InlineData(TaskItemStatus.Completed)]
    public void ChangeStatus_accepts_every_defined_status(TaskItemStatus status)
    {
        ValidationAssert.Valid(_status, new ChangeStatusRequest(status));
    }

    [Fact]
    public void ChangeStatus_rejects_missing_and_undefined()
    {
        ValidationAssert.InvalidOn(_status, new ChangeStatusRequest(null), "Status");
        ValidationAssert.InvalidOn(_status, new ChangeStatusRequest((TaskItemStatus)3), "Status");
    }

    // --- Query -----------------------------------------------------------------------------------

    [Fact]
    public void Default_query_is_valid_and_has_the_documented_defaults()
    {
        var query = new TaskQuery();

        ValidationAssert.Valid(_query, query);
        Assert.Equal(1, query.Page);
        Assert.Equal(10, query.PageSize);
        Assert.Equal(TaskSortField.CreatedAt, query.SortBy);
        Assert.Equal(SortDirection.Desc, query.SortDir);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(100_001)]
    public void Query_rejects_page_outside_range(int page)
    {
        ValidationAssert.InvalidOn(_query, new TaskQuery { Page = page }, "Page");
    }

    [Theory]
    [InlineData(1)]
    [InlineData(50)]
    public void Query_accepts_page_size_boundaries(int size)
    {
        ValidationAssert.Valid(_query, new TaskQuery { PageSize = size });
    }

    [Theory]
    [InlineData(0)]
    [InlineData(51)]
    [InlineData(-5)]
    public void Query_rejects_page_size_outside_1_to_50(int size)
    {
        ValidationAssert.InvalidOn(_query, new TaskQuery { PageSize = size }, "PageSize");
    }

    [Fact]
    public void Query_rejects_inverted_due_range_but_allows_equal_and_open_ended()
    {
        ValidationAssert.InvalidOn(_query, new TaskQuery { DueFrom = T0.AddSeconds(1), DueTo = T0 }, "DueFrom");
        ValidationAssert.Valid(_query, new TaskQuery { DueFrom = T0, DueTo = T0 });
        ValidationAssert.Valid(_query, new TaskQuery { DueFrom = T0 });
        ValidationAssert.Valid(_query, new TaskQuery { DueTo = T0 });
    }

    [Fact]
    public void Query_search_limit_is_200_and_enums_must_be_defined()
    {
        ValidationAssert.Valid(_query, new TaskQuery { Search = new string('s', 200) });
        ValidationAssert.InvalidOn(_query, new TaskQuery { Search = new string('s', 201) }, "Search");
        ValidationAssert.InvalidOn(_query, new TaskQuery { Status = (TaskItemStatus)8 }, "Status");
        ValidationAssert.InvalidOn(_query, new TaskQuery { Priority = (TaskPriority)8 }, "Priority");
        ValidationAssert.InvalidOn(_query, new TaskQuery { SortBy = (TaskSortField)8 }, "SortBy");
        ValidationAssert.InvalidOn(_query, new TaskQuery { SortDir = (SortDirection)8 }, "SortDir");
    }

    // --- Dashboard queries -----------------------------------------------------------------------

    [Theory]
    [InlineData(1, 1, true)]
    [InlineData(20, 90, true)]
    [InlineData(0, 7, false)]
    [InlineData(21, 7, false)]
    [InlineData(5, 0, false)]
    [InlineData(5, 91, false)]
    public void Upcoming_query_limits(int limit, int days, bool valid)
    {
        var errors = ValidationAssert.Errors(new UpcomingTasksQueryValidator(), new UpcomingTasksQuery { Limit = limit, Days = days });

        Assert.Equal(valid, errors.Count == 0);
    }

    [Theory]
    [InlineData(1, true)]
    [InlineData(20, true)]
    [InlineData(0, false)]
    [InlineData(21, false)]
    public void Recent_query_limits(int limit, bool valid)
    {
        var errors = ValidationAssert.Errors(new RecentTasksQueryValidator(), new RecentTasksQuery { Limit = limit });

        Assert.Equal(valid, errors.Count == 0);
    }

    [Fact]
    public void Dashboard_defaults_are_5_items_and_7_days()
    {
        Assert.Equal(5, new UpcomingTasksQuery().Limit);
        Assert.Equal(7, new UpcomingTasksQuery().Days);
        Assert.Equal(5, new RecentTasksQuery().Limit);
    }
}
