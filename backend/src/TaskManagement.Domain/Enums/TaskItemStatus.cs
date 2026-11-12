namespace TaskManagement.Domain.Enums;

/// <summary>Numeric values are persisted; never renumber.</summary>
public enum TaskItemStatus
{
    Todo = 0,
    InProgress = 1,
    Completed = 2,
}
