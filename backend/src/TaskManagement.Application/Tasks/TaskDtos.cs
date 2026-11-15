using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;

namespace TaskManagement.Application.Tasks;

/// <summary>Deliberately has no UserId: clients neither need nor should see ownership data.</summary>
public sealed record TaskDto(
    Guid Id,
    string Title,
    string? Description,
    TaskItemStatus Status,
    TaskPriority Priority,
    DateTimeOffset? StartDate,
    DateTimeOffset? DueDate,
    int? DurationMinutes,
    bool IsOverdue,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    RecurrenceDto? Recurrence = null,
    NextTaskDto? Next = null)
{
    /// <param name="next">Only given in the answer to the call that finished a repeating task, to say what was created.</param>
    public static TaskDto From(TaskItem task, DateTimeOffset now, TaskItem? next = null) => new(
        task.Id,
        task.Title,
        task.Description,
        task.Status,
        task.Priority,
        task.StartDate,
        task.DueDate,
        task.DurationMinutes,
        task.IsOverdue(now),
        task.CreatedAt,
        task.UpdatedAt,
        RecurrenceDto.From(task.Recurrence),
        next is { StartDate: { } nextStart } ? new NextTaskDto(next.Id, nextStart) : null);
}

/// <summary>How a task repeats. Weekdays is a bit mask, Monday = 1 ... Sunday = 64.</summary>
public sealed record RecurrenceDto(RecurrenceFrequency Frequency, int Interval, int Weekdays, DateTimeOffset? Until, int UtcOffsetMinutes)
{
    public static RecurrenceDto? From(Recurrence? recurrence) =>
        recurrence is null ? null : new(recurrence.Frequency, recurrence.Interval, recurrence.Weekdays, recurrence.Until, recurrence.UtcOffsetMinutes);

    public Recurrence ToDomain() => new(Frequency, Interval, Weekdays, Until?.ToUniversalTime(), UtcOffsetMinutes);
}

/// <summary>The occurrence created when a repeating task was finished.</summary>
public sealed record NextTaskDto(Guid Id, DateTimeOffset StartDate);

/// <summary>
/// Status and priority are optional on create and fall back to Todo / Medium (BR-04, BR-05).
/// The due date is no longer entered by hand: with a start time, the task is due when its block of time ends (start plus
/// duration, or the start itself without a duration). <c>DueDate</c> is only honoured for a task with no start time, which
/// keeps older clients and older tasks working.
/// </summary>
/// <summary>What the repeat rules need to know about a request that may repeat.</summary>
public interface IRecurringRequest
{
    DateTimeOffset? StartDate { get; }

    RecurrenceDto? Recurrence { get; }
}

public sealed record CreateTaskRequest(
    string Title,
    string? Description,
    TaskPriority? Priority,
    TaskItemStatus? Status,
    DateTimeOffset? StartDate,
    DateTimeOffset? DueDate,
    int? DurationMinutes = null,
    RecurrenceDto? Recurrence = null) : IRecurringRequest;

/// <summary>
/// Full replacement. Priority and Status are nullable only so that a missing value can be rejected;
/// a plain enum would silently become 0 (Low / Todo).
/// </summary>
public sealed record UpdateTaskRequest(
    string Title,
    string? Description,
    TaskPriority? Priority,
    TaskItemStatus? Status,
    DateTimeOffset? StartDate,
    DateTimeOffset? DueDate,
    int? DurationMinutes = null,
    RecurrenceDto? Recurrence = null) : IRecurringRequest;

public sealed record ChangeStatusRequest(TaskItemStatus? Status);

public enum TaskSortField
{
    CreatedAt,
    DueDate,
    Priority,
    StartDate,
}

public enum SortDirection
{
    Asc,
    Desc,
}

/// <summary>Zero-based <see cref="Index"/> in the filtered, sorted list, and the 1-based <see cref="Page"/> it falls on for the query's page size.</summary>
public sealed record TaskPositionDto(int Page, int Index);

public sealed class TitleSuggestionsQuery
{
    public const int MaxLimit = 20;

    public string? Prefix { get; set; }
    public int Limit { get; set; } = 8;
}

public sealed class TaskQuery
{
    public const int MaxPageSize = 50;
    public const int MaxPage = 100_000;
    public const int MaxSearchLength = 200;

    public string? Search { get; set; }
    public TaskItemStatus? Status { get; set; }
    public TaskPriority? Priority { get; set; }
    public DateTimeOffset? DueFrom { get; set; }
    public DateTimeOffset? DueTo { get; set; }
    public DateTimeOffset? StartFrom { get; set; }
    public DateTimeOffset? StartTo { get; set; }
    public bool? Overdue { get; set; }
    public TaskSortField SortBy { get; set; } = TaskSortField.CreatedAt;
    public SortDirection SortDir { get; set; } = SortDirection.Desc;
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 10;
}
