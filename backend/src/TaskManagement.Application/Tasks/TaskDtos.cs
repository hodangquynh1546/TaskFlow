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
    DateTimeOffset UpdatedAt)
{
    public static TaskDto From(TaskItem task, DateTimeOffset now) => new(
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
        task.UpdatedAt);
}

/// <summary>Status and priority are optional on create and fall back to Todo / Medium (BR-04, BR-05).</summary>
public sealed record CreateTaskRequest(
    string Title,
    string? Description,
    TaskPriority? Priority,
    TaskItemStatus? Status,
    DateTimeOffset? StartDate,
    DateTimeOffset? DueDate,
    int? DurationMinutes = null);

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
    int? DurationMinutes = null);

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
