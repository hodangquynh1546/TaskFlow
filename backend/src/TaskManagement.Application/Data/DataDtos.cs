using TaskManagement.Application.Tasks;

namespace TaskManagement.Application.Data;

/// <summary>
/// A task as it travels in a file. Names are the API's own, ids are left out of what is imported (a new task gets a new id),
/// and the due date is informational: a task with a start time is due when its block ends, whatever the file says.
/// </summary>
public sealed record PortableTask(
    string Title,
    string? Description,
    string? Status,
    string? Priority,
    DateTimeOffset? StartDate,
    int? DurationMinutes,
    DateTimeOffset? DueDate,
    DateTimeOffset? CreatedAt,
    RecurrenceDto? Recurrence = null);

/// <summary>The JSON file: a small envelope so a file says what it is and which layout it uses.</summary>
public sealed record PortableFile(string App, int Version, DateTimeOffset ExportedAt, IReadOnlyList<PortableTask> Tasks);

public enum DataFormat
{
    Json,
    Csv,
}

/// <summary>The file's text and its format. Read on the client so the browser never has to upload a binary file.</summary>
public sealed record ImportRequest(string Format, string Content);

/// <summary>One row that could not be imported. <see cref="Row"/> counts from 1 as the user sees it (CSV: the header is row 1).</summary>
public sealed record ImportErrorDto(int Row, string Field, string Message);

public sealed record ImportResultDto(int Imported, int Duplicates, int Failed, IReadOnlyList<ImportErrorDto> Errors);
