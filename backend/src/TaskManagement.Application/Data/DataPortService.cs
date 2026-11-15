using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Application.Abstractions;
using TaskManagement.Application.Common;
using TaskManagement.Application.Tasks;
using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.Application.Data;

public interface IDataPortService
{
    /// <summary>Every task of the signed-in user, oldest first, in the portable layout.</summary>
    Task<PortableFile> ExportAsync(CancellationToken cancellationToken);

    Task<ImportResultDto> ImportAsync(ImportRequest request, CancellationToken cancellationToken);
}

public sealed class ImportRequestValidator : AbstractValidator<ImportRequest>
{
    public ImportRequestValidator()
    {
        RuleFor(x => x.Format).Must(f => Enum.TryParse<DataFormat>(f, true, out _)).WithMessage("Định dạng nhập phải là json hoặc csv.");
        RuleFor(x => x.Content).NotNull().WithMessage("Tệp nhập không đọc được.")
            .Must(c => c is null || c.Length <= DataPortService.MaxContentLength).WithMessage($"Tệp nhập tối đa {DataPortService.MaxContentLength} ký tự.");
    }
}

internal sealed class DataPortService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<ImportRequest> importValidator,
    IValidator<CreateTaskRequest> taskValidator) : IDataPortService
{
    public const int MaxContentLength = 5_000_000;
    public const int MaxTasks = 2000;
    private const int MaxReportedErrors = 50;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    public async Task<PortableFile> ExportAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var tasks = await db.Tasks.AsNoTracking()
            .Where(t => t.UserId == userId)
            .OrderBy(t => t.CreatedAt).ThenBy(t => t.Id)
            .ToListAsync(cancellationToken);

        return new PortableFile(
            "TaskFlow",
            1,
            clock.GetUtcNow(),
            tasks.ConvertAll(t => new PortableTask(t.Title, t.Description, t.Status.ToString(), t.Priority.ToString(), t.StartDate, t.DurationMinutes, t.DueDate, t.CreatedAt, RecurrenceDto.From(t.Recurrence))));
    }

    public async Task<ImportResultDto> ImportAsync(ImportRequest request, CancellationToken cancellationToken)
    {
        await importValidator.ValidateAndThrowAsync(request, cancellationToken);

        var errors = new List<ImportErrorDto>();
        var rows = Parse(request, errors);
        if (rows.Count > MaxTasks)
        {
            throw new DomainException($"Chỉ nhập tối đa {MaxTasks} công việc một lần.", "content");
        }

        var userId = currentUser.UserId;
        var now = clock.GetUtcNow();
        var seen = await ExistingKeysAsync(userId, cancellationToken);
        var imported = 0;
        var duplicates = 0;

        foreach (var (row, task) in rows)
        {
            var failure = Check(task, out var create, out var status, out var priority);
            if (failure is not null)
            {
                AddError(errors, row, failure.Value.Field, failure.Value.Message);
                continue;
            }

            var start = create!.StartDate;
            if (!seen.Add(KeyOf(create.Title, start)))
            {
                duplicates++; // the same title at the same time is already there: importing the file twice adds nothing
                continue;
            }

            try
            {
                db.Tasks.Add(TaskItem.Create(
                    userId, create.Title, create.Description, priority, status, start,
                    TaskSchedule.DueFor(start, create.DurationMinutes, create.DueDate), now, create.DurationMinutes, create.Recurrence?.ToDomain()));
                imported++;
            }
            catch (DomainException e)
            {
                AddError(errors, row, e.Field ?? "title", e.Message);
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        // The count is of every row that failed; the list is cut short so a hopeless file does not make a huge answer.
        return new ImportResultDto(imported, duplicates, errors.Count, errors.Take(MaxReportedErrors).ToList());
    }

    private static List<(int Row, PortableTask Task)> Parse(ImportRequest request, List<ImportErrorDto> errors)
    {
        var content = request.Content.TrimStart('﻿');
        return Enum.Parse<DataFormat>(request.Format, true) == DataFormat.Csv ? ParseCsv(content, errors) : ParseJson(content);
    }

    private static List<(int, PortableTask)> ParseJson(string content)
    {
        try
        {
            using var document = JsonDocument.Parse(content);
            // Either the exported envelope, or a bare list of tasks.
            var list = document.RootElement.ValueKind == JsonValueKind.Array
                ? document.RootElement
                : document.RootElement.TryGetProperty("tasks", out var tasks) ? tasks : throw new JsonException();
            if (list.ValueKind != JsonValueKind.Array)
            {
                throw new JsonException();
            }

            var result = new List<(int, PortableTask)>();
            var row = 0;
            foreach (var item in list.EnumerateArray())
            {
                row++;
                result.Add((row, item.Deserialize<PortableTask>(Json) ?? throw new JsonException()));
            }

            return result;
        }
        catch (JsonException)
        {
            throw new DomainException("Tệp nhập không đọc được.", "content");
        }
    }

    private static List<(int, PortableTask)> ParseCsv(string content, List<ImportErrorDto> errors)
    {
        if (!TaskCsv.HasColumn(content, "title"))
        {
            throw new DomainException("Tệp CSV cần có cột tiêu đề (title).", "content");
        }

        var result = new List<(int, PortableTask)>();
        foreach (var (row, cells) in TaskCsv.Read(content))
        {
            string? Get(string name) => cells.TryGetValue(name, out var value) && !string.IsNullOrWhiteSpace(value) ? value : null;

            var startDate = Date(Get("startDate"), "startDate", row, errors, out var startOk);
            var dueDate = Date(Get("dueDate"), "dueDate", row, errors, out var dueOk);
            var createdAt = Date(Get("createdAt"), "createdAt", row, errors, out var createdOk);
            var duration = Get("durationMinutes") is { } text && int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var minutes) ? minutes : (int?)null;
            if (Get("durationMinutes") is not null && duration is null)
            {
                AddError(errors, row, "durationMinutes", "Thời lượng không hợp lệ.");
                continue;
            }

            if (!startOk || !dueOk || !createdOk)
            {
                continue;
            }

            var repeat = ParseRepeat(Get, row, errors, out var repeatOk);
            if (!repeatOk)
            {
                continue;
            }

            result.Add((row, new PortableTask(Get("title") ?? string.Empty, Get("description"), Get("status"), Get("priority"), startDate, duration, dueDate, createdAt, repeat)));
        }

        return result;
    }

    /// <summary>The five "repeat" columns; all empty means the task does not repeat.</summary>
    private static RecurrenceDto? ParseRepeat(Func<string, string?> get, int row, List<ImportErrorDto> errors, out bool ok)
    {
        ok = true;
        if (get("repeat") is not { } kind)
        {
            return null;
        }

        if (!Enum.TryParse<RecurrenceFrequency>(kind, true, out var frequency))
        {
            ok = false;
            AddError(errors, row, "repeat", "Kiểu lặp không hợp lệ.");
            return null;
        }

        var interval = Number(get, "repeatEvery", 1, row, errors, ref ok);
        var weekdays = Number(get, "repeatDays", 0, row, errors, ref ok);
        var offset = Number(get, "repeatOffsetMinutes", 0, row, errors, ref ok);
        var until = Date(get("repeatUntil"), "repeatUntil", row, errors, out var untilOk);
        ok &= untilOk;
        return new RecurrenceDto(frequency, interval, weekdays, until, offset);
    }

    private static int Number(Func<string, string?> get, string column, int fallback, int row, List<ImportErrorDto> errors, ref bool ok)
    {
        if (get(column) is not { } text)
        {
            return fallback;
        }

        if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value))
        {
            return value;
        }

        ok = false;
        AddError(errors, row, column, "Giá trị không hợp lệ.");
        return fallback;
    }

    private static DateTimeOffset? Date(string? text, string field, int row, List<ImportErrorDto> errors, out bool ok)
    {
        ok = true;
        if (text is null)
        {
            return null;
        }

        // A time with no zone is taken as UTC: the files we write always say Z.
        if (DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value))
        {
            return value;
        }

        ok = false;
        AddError(errors, row, field, "Ngày giờ không hợp lệ.");
        return null;
    }

    /// <summary>Runs the same rules as creating a task by hand, so a file cannot bring in anything the form would refuse.</summary>
    private (string Field, string Message)? Check(PortableTask task, out CreateTaskRequest? create, out TaskItemStatus status, out TaskPriority priority)
    {
        status = TaskItemStatus.Todo;
        priority = TaskPriority.Medium;
        create = null;

        if (task.Status is { } s && !Enum.TryParse(s, true, out status))
        {
            return ("status", "Trạng thái không hợp lệ.");
        }

        if (task.Priority is { } p && !Enum.TryParse(p, true, out priority))
        {
            return ("priority", "Mức ưu tiên không hợp lệ.");
        }

        create = new CreateTaskRequest(task.Title, task.Description, priority, status, task.StartDate, task.DueDate, task.DurationMinutes, task.Recurrence);
        var result = taskValidator.Validate(create);
        if (!result.IsValid)
        {
            var first = result.Errors[0];
            create = null;
            return (string.Join('.', first.PropertyName.Split('.').Select(part => char.ToLowerInvariant(part[0]) + part[1..])), first.ErrorMessage);
        }

        return null;
    }

    private async Task<HashSet<string>> ExistingKeysAsync(Guid userId, CancellationToken cancellationToken)
    {
        var existing = await db.Tasks.AsNoTracking().Where(t => t.UserId == userId).Select(t => new { t.Title, t.StartDate }).ToListAsync(cancellationToken);
        return existing.Select(t => KeyOf(t.Title, t.StartDate)).ToHashSet(StringComparer.Ordinal);
    }

    private static string KeyOf(string title, DateTimeOffset? start) =>
        $"{title.Trim().ToLowerInvariant()}|{start?.ToUniversalTime().ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture)}";

    private static void AddError(List<ImportErrorDto> errors, int row, string field, string message) =>
        errors.Add(new ImportErrorDto(row, field, message));
}
