using TaskManagement.Application.Data;

namespace TaskManagement.UnitTests.Data;

public sealed class TaskCsvTests
{
    private static readonly DateTimeOffset T0 = new(2030, 5, 1, 8, 0, 0, TimeSpan.Zero);

    private static PortableTask Task(string title, string? description = null) =>
        new(title, description, "Todo", "Medium", null, null, null, null);

    [Fact]
    public void A_repeat_is_written_in_its_own_columns_and_a_task_without_one_leaves_them_empty()
    {
        var repeating = Task("Lặp") with { Recurrence = new(TaskManagement.Domain.Enums.RecurrenceFrequency.Weekly, 2, 5, T0.AddDays(30), 420) };

        var rows = TaskCsv.Read(TaskCsv.Write([repeating, Task("Một lần")]));

        Assert.Equal(("Weekly", "2", "5", "2030-05-31T08:00:00Z", "420"), (rows[0].Cells["repeat"], rows[0].Cells["repeatEvery"], rows[0].Cells["repeatDays"], rows[0].Cells["repeatUntil"], rows[0].Cells["repeatOffsetMinutes"]));
        Assert.Equal(string.Empty, rows[1].Cells["repeat"]);
    }

    private static string Round(string text) => TaskCsv.Read(TaskCsv.Write([Task(text)]))[0].Cells["title"];

    [Fact]
    public void The_first_line_names_the_columns_and_lines_end_with_CRLF()
    {
        var csv = TaskCsv.Write([Task("A")]);

        Assert.StartsWith("title,description,status,priority,startDate,durationMinutes,dueDate,createdAt,repeat,repeatEvery,repeatDays,repeatUntil,repeatOffsetMinutes\r\n", csv, StringComparison.Ordinal);
        Assert.EndsWith("\r\n", csv, StringComparison.Ordinal);
    }

    [Fact]
    public void A_task_comes_back_the_way_it_went_out_including_dates_in_UTC()
    {
        var task = new PortableTask("Họp nhóm", "Chuẩn bị slide", "InProgress", "High", T0, 90, T0.AddMinutes(90), T0.AddDays(-3));

        var row = TaskCsv.Read(TaskCsv.Write([task])).Single();

        Assert.Equal(2, row.Row);
        Assert.Equal("Họp nhóm", row.Cells["title"]);
        Assert.Equal("Chuẩn bị slide", row.Cells["description"]);
        Assert.Equal("InProgress", row.Cells["status"]);
        Assert.Equal("High", row.Cells["priority"]);
        Assert.Equal("2030-05-01T08:00:00Z", row.Cells["startDate"]);
        Assert.Equal("90", row.Cells["durationMinutes"]);
        Assert.Equal("2030-05-01T09:30:00Z", row.Cells["dueDate"]);
    }

    [Theory]
    [InlineData("có, dấu phẩy")]
    [InlineData("có \"ngoặc kép\" trong chữ")]
    [InlineData("hai\ndòng")]
    [InlineData("hai\r\ndòng windows")]
    [InlineData("  khoảng trắng đầu cuối  ")]
    [InlineData("đã dạy, động, \"đen\"\nhọc")]
    public void Commas_quotes_and_line_breaks_survive_a_round_trip(string text)
    {
        Assert.Equal(text.Replace("\r\n", "\n", StringComparison.Ordinal), Round(text).Replace("\r\n", "\n", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("=HYPERLINK(\"http://evil\")")]
    [InlineData("+1+1")]
    [InlineData("-2+3")]
    [InlineData("@SUM(A1)")]
    public void Text_a_spreadsheet_would_run_as_a_formula_is_defused_in_the_file_but_comes_back_unchanged(string title)
    {
        var csv = TaskCsv.Write([Task(title)]);

        Assert.DoesNotContain("\r\n" + title[0], csv, StringComparison.Ordinal); // no cell starts with the dangerous character
        Assert.Equal(title, Round(title));
    }

    [Fact]
    public void An_ordinary_leading_apostrophe_is_left_alone()
    {
        Assert.Equal("'quoted", Round("'quoted"));
    }

    [Fact]
    public void A_byte_order_mark_and_any_column_order_are_accepted_and_blank_lines_skipped()
    {
        var csv = "﻿Priority,TITLE,unknown\r\nHigh,Việc một,x\r\n\r\n,Việc hai,\r\n";

        var rows = TaskCsv.Read(csv);

        Assert.Equal(2, rows.Count);
        Assert.Equal((2, "Việc một", "High"), (rows[0].Row, rows[0].Cells["title"], rows[0].Cells["priority"]));
        Assert.Equal((4, "Việc hai"), (rows[1].Row, rows[1].Cells["title"]));
    }

    [Fact]
    public void A_final_line_without_a_line_break_is_still_read()
    {
        Assert.Single(TaskCsv.Read("title\r\nmột"));
    }

    [Fact]
    public void Knows_whether_a_title_column_exists()
    {
        Assert.True(TaskCsv.HasColumn("a,Title\r\n1,2", "title"));
        Assert.False(TaskCsv.HasColumn("a,b\r\n1,2", "title"));
        Assert.False(TaskCsv.HasColumn(string.Empty, "title"));
    }

    [Fact]
    public void Empty_text_has_no_rows()
    {
        Assert.Empty(TaskCsv.Read(string.Empty));
        Assert.Empty(TaskCsv.Read("title\r\n"));
    }
}
