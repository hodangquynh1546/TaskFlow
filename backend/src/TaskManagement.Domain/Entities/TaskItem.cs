using TaskManagement.Domain.Enums;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.Domain.Entities;

/// <summary>A personal task. Named TaskItem to avoid clashing with System.Threading.Tasks.Task.</summary>
public sealed class TaskItem
{
    public const int TitleMaxLength = 200;
    public const int DescriptionMaxLength = 5000;
    public const int MaxDurationMinutes = 24 * 60;

    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public TaskItemStatus Status { get; private set; }
    public TaskPriority Priority { get; private set; }
    public DateTimeOffset? StartDate { get; private set; }
    public DateTimeOffset? DueDate { get; private set; }

    /// <summary>Planned length in minutes (BR-13). With <see cref="StartDate"/> it describes a block of time in a day.</summary>
    public int? DurationMinutes { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    private TaskItem() { }

    /// <summary>BR-04/05: status defaults to Todo and priority to Medium when not supplied.</summary>
    public static TaskItem Create(
        Guid userId,
        string title,
        string? description,
        TaskPriority? priority,
        TaskItemStatus? status,
        DateTimeOffset? startDate,
        DateTimeOffset? dueDate,
        DateTimeOffset now,
        int? durationMinutes = null)
    {
        if (userId == Guid.Empty)
        {
            throw new DomainException("Công việc phải thuộc về một người dùng.");
        }

        var task = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            CreatedAt = now.ToUniversalTime(),
        };
        task.Apply(title, description, priority ?? TaskPriority.Medium, status ?? TaskItemStatus.Todo, startDate, dueDate, now, durationMinutes);
        return task;
    }

    /// <summary>Replaces all editable fields (PUT semantics).</summary>
    public void Update(
        string title,
        string? description,
        TaskPriority priority,
        TaskItemStatus status,
        DateTimeOffset? startDate,
        DateTimeOffset? dueDate,
        DateTimeOffset now,
        int? durationMinutes = null) =>
        Apply(title, description, priority, status, startDate, dueDate, now, durationMinutes);

    /// <summary>BR-08: any status can move to any other, including re-opening a completed task.</summary>
    public void ChangeStatus(TaskItemStatus status, DateTimeOffset now)
    {
        RequireDefined(status, "status");
        Status = status;
        UpdatedAt = now.ToUniversalTime();
    }

    /// <summary>BR-09: strictly past due and not completed. No due date means never overdue.</summary>
    public bool IsOverdue(DateTimeOffset now) =>
        DueDate is { } due && due < now && Status != TaskItemStatus.Completed;

    private void Apply(
        string title,
        string? description,
        TaskPriority priority,
        TaskItemStatus status,
        DateTimeOffset? startDate,
        DateTimeOffset? dueDate,
        DateTimeOffset now,
        int? durationMinutes)
    {
        var cleanTitle = title?.Trim() ?? string.Empty;
        if (cleanTitle.Length is 0 or > TitleMaxLength)
        {
            throw new DomainException($"Tiêu đề phải từ 1 đến {TitleMaxLength} ký tự.", "title");
        }

        if (description is { Length: > DescriptionMaxLength })
        {
            throw new DomainException($"Mô tả tối đa {DescriptionMaxLength} ký tự.", "description");
        }

        RequireDefined(priority, "priority");
        RequireDefined(status, "status");

        if (durationMinutes is < 1 or > MaxDurationMinutes)
        {
            throw new DomainException($"Thời lượng phải từ 1 đến {MaxDurationMinutes} phút.", "durationMinutes");
        }

        var start = startDate?.ToUniversalTime();
        var due = dueDate?.ToUniversalTime();
        if (start is { } s && due is { } d && s > d)
        {
            throw new DomainException("Ngày bắt đầu không được sau hạn hoàn thành.", "startDate");
        }

        Title = cleanTitle;
        Description = string.IsNullOrWhiteSpace(description) ? null : description;
        Priority = priority;
        Status = status;
        StartDate = start;
        DueDate = due;
        DurationMinutes = durationMinutes;
        UpdatedAt = now.ToUniversalTime();
    }

    private static void RequireDefined<T>(T value, string field) where T : struct, Enum
    {
        if (!Enum.IsDefined(value))
        {
            throw new DomainException("Giá trị không hợp lệ.", field);
        }
    }
}
