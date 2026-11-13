namespace TaskManagement.Application.Tasks;

internal static class TaskSchedule
{
    /// <summary>
    /// A scheduled task is due when its block ends: start plus duration, or the start itself when it has no duration.
    /// A task with no start time has no block, so a due date sent by an older client is kept as it is.
    /// </summary>
    public static DateTimeOffset? DueFor(DateTimeOffset? start, int? durationMinutes, DateTimeOffset? requestedDue) =>
        start is { } s ? s.AddMinutes(durationMinutes ?? 0) : requestedDue;
}
