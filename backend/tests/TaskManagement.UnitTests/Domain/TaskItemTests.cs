using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.UnitTests.Domain;

public class TaskItemTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 12, 9, 0, 0, TimeSpan.Zero);
    private static readonly Guid UserId = Guid.NewGuid();

    private static TaskItem NewTask(
        string title = "Viết báo cáo",
        string? description = null,
        TaskPriority? priority = null,
        TaskItemStatus? status = null,
        DateTimeOffset? start = null,
        DateTimeOffset? due = null) =>
        TaskItem.Create(UserId, title, description, priority, status, start, due, Now);

    // --- Creation defaults (BR-01, BR-04, BR-05) -------------------------------------------------

    [Fact]
    public void Create_applies_defaults_Todo_and_Medium()
    {
        var task = NewTask();

        Assert.Equal(TaskItemStatus.Todo, task.Status);
        Assert.Equal(TaskPriority.Medium, task.Priority);
    }

    [Fact]
    public void Create_keeps_explicit_status_and_priority()
    {
        var task = NewTask(priority: TaskPriority.High, status: TaskItemStatus.InProgress);

        Assert.Equal(TaskPriority.High, task.Priority);
        Assert.Equal(TaskItemStatus.InProgress, task.Status);
    }

    [Fact]
    public void Create_assigns_owner_id_and_timestamps()
    {
        var task = NewTask();

        Assert.Equal(UserId, task.UserId);
        Assert.NotEqual(Guid.Empty, task.Id);
        Assert.Equal(Now, task.CreatedAt);
        Assert.Equal(Now, task.UpdatedAt);
    }

    [Fact]
    public void Create_rejects_empty_owner()
    {
        Assert.Throws<DomainException>(() =>
            TaskItem.Create(Guid.Empty, "x", null, null, null, null, null, Now));
    }

    // --- Title (BR-02) ---------------------------------------------------------------------------

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_title(string title)
    {
        var ex = Assert.Throws<DomainException>(() => NewTask(title: title));

        Assert.Equal("title", ex.Field);
    }

    [Fact]
    public void Create_trims_title()
    {
        Assert.Equal("Họp nhóm", NewTask(title: "  Họp nhóm  ").Title);
    }

    [Fact]
    public void Title_of_exactly_200_chars_is_allowed_and_201_is_not()
    {
        Assert.Equal(200, NewTask(title: new string('a', 200)).Title.Length);

        var ex = Assert.Throws<DomainException>(() => NewTask(title: new string('a', 201)));
        Assert.Equal("title", ex.Field);
    }

    [Fact]
    public void Length_limit_applies_after_trimming()
    {
        var padded = "  " + new string('a', 200) + "  ";

        Assert.Equal(200, NewTask(title: padded).Title.Length);
    }

    // --- Description (BR-03) ---------------------------------------------------------------------

    [Fact]
    public void Description_is_optional_and_blank_becomes_null()
    {
        Assert.Null(NewTask(description: null).Description);
        Assert.Null(NewTask(description: "   ").Description);
    }

    [Fact]
    public void Description_limit_is_5000()
    {
        Assert.Equal(5000, NewTask(description: new string('d', 5000)).Description!.Length);

        var ex = Assert.Throws<DomainException>(() => NewTask(description: new string('d', 5001)));
        Assert.Equal("description", ex.Field);
    }

    // --- Dates (BR-06) ---------------------------------------------------------------------------

    [Fact]
    public void Start_after_due_is_rejected()
    {
        var ex = Assert.Throws<DomainException>(() =>
            NewTask(start: Now.AddSeconds(1), due: Now));

        Assert.Equal("startDate", ex.Field);
    }

    [Fact]
    public void Start_equal_to_due_is_allowed()
    {
        var task = NewTask(start: Now, due: Now);

        Assert.Equal(Now, task.StartDate);
        Assert.Equal(Now, task.DueDate);
    }

    [Fact]
    public void Start_before_due_is_allowed()
    {
        Assert.NotNull(NewTask(start: Now, due: Now.AddDays(1)).DueDate);
    }

    [Fact]
    public void Only_one_date_supplied_is_always_valid()
    {
        Assert.Null(NewTask(start: Now).DueDate);
        Assert.Null(NewTask(due: Now.AddDays(-30)).StartDate);
    }

    [Fact]
    public void Ordering_is_compared_in_utc_not_by_local_clock_time()
    {
        // 10:00 at +07:00 is 03:00 UTC, which is before 05:00 UTC even though 10 > 05 on the wall clock.
        var start = new DateTimeOffset(2026, 11, 12, 10, 0, 0, TimeSpan.FromHours(7));
        var due = new DateTimeOffset(2026, 11, 12, 5, 0, 0, TimeSpan.Zero);

        var task = NewTask(start: start, due: due);

        Assert.Equal(TimeSpan.Zero, task.StartDate!.Value.Offset);
        Assert.Equal(new DateTimeOffset(2026, 11, 12, 3, 0, 0, TimeSpan.Zero), task.StartDate);
    }

    // --- Enums (BR-07) ---------------------------------------------------------------------------

    [Fact]
    public void Undefined_enum_values_are_rejected()
    {
        Assert.Equal("priority", Assert.Throws<DomainException>(() => NewTask(priority: (TaskPriority)99)).Field);
        Assert.Equal("status", Assert.Throws<DomainException>(() => NewTask(status: (TaskItemStatus)(-1))).Field);
    }

    // --- Duration (BR-13) ---------------------------------------------------------------------

    private static TaskItem WithDuration(int? minutes) =>
        TaskItem.Create(UserId, "Việc", null, null, null, null, null, Now, minutes);

    [Theory]
    [InlineData(1)]
    [InlineData(15)]
    [InlineData(30)]
    [InlineData(60)]
    [InlineData(240)]
    [InlineData(1440)]
    public void Duration_from_1_to_1440_minutes_is_accepted(int minutes)
    {
        Assert.Equal(minutes, WithDuration(minutes).DurationMinutes);
    }

    [Fact]
    public void Duration_is_optional_and_defaults_to_none()
    {
        Assert.Null(WithDuration(null).DurationMinutes);
        Assert.Null(NewTask().DurationMinutes);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-30)]
    [InlineData(1441)]
    [InlineData(int.MaxValue)]
    [InlineData(int.MinValue)]
    public void Duration_outside_1_to_1440_is_rejected_with_the_field_named(int minutes)
    {
        var ex = Assert.Throws<DomainException>(() => WithDuration(minutes));

        Assert.Equal("durationMinutes", ex.Field);
    }

    [Fact]
    public void Update_replaces_and_clears_the_duration()
    {
        var task = WithDuration(30);

        task.Update("Việc", null, TaskPriority.Medium, TaskItemStatus.Todo, null, null, Now.AddHours(1), 90);
        Assert.Equal(90, task.DurationMinutes);

        task.Update("Việc", null, TaskPriority.Medium, TaskItemStatus.Todo, null, null, Now.AddHours(2));
        Assert.Null(task.DurationMinutes);
    }

    [Fact]
    public void A_rejected_update_leaves_the_duration_unchanged()
    {
        var task = WithDuration(45);

        Assert.Throws<DomainException>(() =>
            task.Update("Việc", null, TaskPriority.Medium, TaskItemStatus.Todo, null, null, Now.AddHours(1), 5000));

        Assert.Equal(45, task.DurationMinutes);
        Assert.Equal(Now, task.UpdatedAt);
    }

    [Fact]
    public void Changing_status_does_not_touch_the_duration()
    {
        var task = WithDuration(120);

        task.ChangeStatus(TaskItemStatus.Completed, Now.AddHours(1));

        Assert.Equal(120, task.DurationMinutes);
    }

    // --- Status changes (BR-08, BR-12) -----------------------------------------------------------

    [Theory]
    [InlineData(TaskItemStatus.Todo, TaskItemStatus.InProgress)]
    [InlineData(TaskItemStatus.InProgress, TaskItemStatus.Completed)]
    [InlineData(TaskItemStatus.Completed, TaskItemStatus.Todo)]
    [InlineData(TaskItemStatus.Todo, TaskItemStatus.Completed)]
    [InlineData(TaskItemStatus.Completed, TaskItemStatus.InProgress)]
    public void ChangeStatus_allows_any_transition_including_reopening(TaskItemStatus from, TaskItemStatus to)
    {
        var task = NewTask(status: from);
        var later = Now.AddHours(2);

        task.ChangeStatus(to, later);

        Assert.Equal(to, task.Status);
        Assert.Equal(later, task.UpdatedAt);
        Assert.Equal(Now, task.CreatedAt);
    }

    [Fact]
    public void ChangeStatus_rejects_undefined_value_and_leaves_task_unchanged()
    {
        var task = NewTask(status: TaskItemStatus.InProgress);

        Assert.Throws<DomainException>(() => task.ChangeStatus((TaskItemStatus)7, Now.AddHours(1)));

        Assert.Equal(TaskItemStatus.InProgress, task.Status);
        Assert.Equal(Now, task.UpdatedAt);
    }

    // --- Update (PUT semantics, BR-12) -----------------------------------------------------------

    [Fact]
    public void Update_replaces_all_fields_and_can_clear_optional_ones()
    {
        var task = NewTask(description: "cũ", start: Now, due: Now.AddDays(1));
        var later = Now.AddDays(2);

        task.Update("Tiêu đề mới", null, TaskPriority.Low, TaskItemStatus.Completed, null, null, later);

        Assert.Equal("Tiêu đề mới", task.Title);
        Assert.Null(task.Description);
        Assert.Null(task.StartDate);
        Assert.Null(task.DueDate);
        Assert.Equal(TaskPriority.Low, task.Priority);
        Assert.Equal(TaskItemStatus.Completed, task.Status);
        Assert.Equal(later, task.UpdatedAt);
        Assert.Equal(Now, task.CreatedAt);
    }

    [Fact]
    public void Failed_update_leaves_the_task_untouched()
    {
        var task = NewTask(title: "Giữ nguyên", due: Now.AddDays(1));

        Assert.Throws<DomainException>(() =>
            task.Update("Mới", null, TaskPriority.High, TaskItemStatus.Completed, Now.AddDays(5), Now, Now.AddHours(1)));

        Assert.Equal("Giữ nguyên", task.Title);
        Assert.Equal(TaskPriority.Medium, task.Priority);
        Assert.Equal(Now, task.UpdatedAt);
    }

    // --- Overdue (BR-09) -------------------------------------------------------------------------

    [Theory]
    [InlineData(TaskItemStatus.Todo, -1, true)]
    [InlineData(TaskItemStatus.InProgress, -1, true)]
    [InlineData(TaskItemStatus.Completed, -1, false)]
    [InlineData(TaskItemStatus.Todo, 0, false)]
    [InlineData(TaskItemStatus.Todo, 1, false)]
    public void IsOverdue_requires_due_strictly_before_now_and_not_completed(TaskItemStatus status, int dueOffsetSeconds, bool expected)
    {
        var task = NewTask(status: status, due: Now.AddSeconds(dueOffsetSeconds));

        Assert.Equal(expected, task.IsOverdue(Now));
    }

    [Fact]
    public void Task_without_due_date_is_never_overdue()
    {
        Assert.False(NewTask(due: null).IsOverdue(Now.AddYears(10)));
    }

    [Fact]
    public void Completing_an_overdue_task_clears_the_overdue_flag_and_reopening_restores_it()
    {
        var task = NewTask(due: Now.AddDays(-1));
        Assert.True(task.IsOverdue(Now));

        task.ChangeStatus(TaskItemStatus.Completed, Now);
        Assert.False(task.IsOverdue(Now));

        task.ChangeStatus(TaskItemStatus.Todo, Now);
        Assert.True(task.IsOverdue(Now));
    }
}
