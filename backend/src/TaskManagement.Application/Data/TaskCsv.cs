using System.Globalization;
using System.Text;

namespace TaskManagement.Application.Data;

/// <summary>
/// CSV for tasks: RFC 4180 quoting, a header row, UTF-8. Text cells that a spreadsheet would run as a formula
/// ("=", "+", "-", "@") get a leading apostrophe on the way out and lose it on the way in, so a task titled
/// "=HYPERLINK(...)" cannot do anything when the file is opened in Excel, yet survives a round trip unchanged.
/// </summary>
public static class TaskCsv
{
    public static readonly IReadOnlyList<string> Columns =
        ["title", "description", "status", "priority", "startDate", "durationMinutes", "dueDate", "createdAt", "repeat", "repeatEvery", "repeatDays", "repeatUntil", "repeatOffsetMinutes"];

    private const char FormulaGuard = '\'';

    public static string Write(IEnumerable<PortableTask> tasks)
    {
        var text = new StringBuilder();
        text.Append(string.Join(',', Columns)).Append("\r\n");
        foreach (var task in tasks)
        {
            text.Append(string.Join(',', new[]
            {
                Cell(task.Title),
                Cell(task.Description),
                Cell(task.Status),
                Cell(task.Priority),
                Cell(Iso(task.StartDate)),
                Cell(task.DurationMinutes?.ToString(CultureInfo.InvariantCulture)),
                Cell(Iso(task.DueDate)),
                Cell(Iso(task.CreatedAt)),
                Cell(task.Recurrence?.Frequency.ToString()),
                Cell(task.Recurrence?.Interval.ToString(CultureInfo.InvariantCulture)),
                Cell(task.Recurrence?.Weekdays.ToString(CultureInfo.InvariantCulture)),
                Cell(Iso(task.Recurrence?.Until)),
                Cell(task.Recurrence?.UtcOffsetMinutes.ToString(CultureInfo.InvariantCulture)),
            })).Append("\r\n");
        }

        return text.ToString();
    }

    /// <summary>Header names match case-insensitively and in any order; unknown columns are ignored. Row numbers are 1-based, the header being row 1.</summary>
    public static IReadOnlyList<(int Row, IReadOnlyDictionary<string, string> Cells)> Read(string csv)
    {
        var rows = Split(csv.TrimStart('﻿'));
        if (rows.Count == 0)
        {
            return [];
        }

        var header = rows[0].Select(h => h.Trim()).ToList();
        var result = new List<(int, IReadOnlyDictionary<string, string>)>();
        for (var i = 1; i < rows.Count; i++)
        {
            var cells = rows[i];
            if (cells.All(string.IsNullOrWhiteSpace))
            {
                continue; // a blank line is not a task
            }

            var byName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var c = 0; c < header.Count && c < cells.Count; c++)
            {
                byName[header[c]] = Unguard(cells[c]);
            }

            result.Add((i + 1, byName));
        }

        return result;
    }

    public static bool HasColumn(string csv, string column)
    {
        var rows = Split(csv.TrimStart('﻿'));
        return rows.Count > 0 && rows[0].Any(h => string.Equals(h.Trim(), column, StringComparison.OrdinalIgnoreCase));
    }

    private static string? Iso(DateTimeOffset? value) => value?.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    private static string Cell(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        if (value[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
        {
            value = FormulaGuard + value;
        }

        return value.AsSpan().IndexOfAny(",\"\r\n") >= 0 ? $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"" : value;
    }

    private static string Unguard(string value) =>
        value.Length > 1 && value[0] == FormulaGuard && value[1] is '=' or '+' or '-' or '@' or '\t' or '\r' ? value[1..] : value;

    /// <summary>A small state machine: quotes may hold commas and line breaks, and "" inside quotes is one quote.</summary>
    private static List<List<string>> Split(string csv)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;

        for (var i = 0; i < csv.Length; i++)
        {
            var ch = csv[i];
            if (quoted)
            {
                if (ch == '"' && i + 1 < csv.Length && csv[i + 1] == '"')
                {
                    cell.Append('"');
                    i++;
                }
                else if (ch == '"')
                {
                    quoted = false;
                }
                else
                {
                    cell.Append(ch);
                }

                continue;
            }

            switch (ch)
            {
                case '"' when cell.Length == 0:
                    quoted = true;
                    break;
                case ',':
                    row.Add(cell.ToString());
                    cell.Clear();
                    break;
                case '\r':
                    break;
                case '\n':
                    row.Add(cell.ToString());
                    cell.Clear();
                    rows.Add(row);
                    row = [];
                    break;
                default:
                    cell.Append(ch);
                    break;
            }
        }

        if (cell.Length > 0 || row.Count > 0)
        {
            row.Add(cell.ToString());
            rows.Add(row);
        }

        return rows;
    }
}
