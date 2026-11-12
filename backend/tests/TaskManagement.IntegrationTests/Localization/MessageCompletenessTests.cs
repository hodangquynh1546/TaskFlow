using System.Text.RegularExpressions;
using TaskManagement.API.Localization;

namespace TaskManagement.IntegrationTests.Localization;

/// <summary>
/// Every user-facing Vietnamese message in the backend must have an English translation. This reads the real source,
/// so a new message without a translation fails the build instead of reaching an English user in Vietnamese.
/// </summary>
public sealed partial class MessageCompletenessTests
{
    private static readonly string BackendRoot = FindBackendRoot();

    // Titles are translated through their own table (ProblemMessages.TitleFor), not as messages.
    private static readonly HashSet<string> Titles = ["Dữ liệu không hợp lệ", "Chưa đăng nhập", "Không tìm thấy", "Dữ liệu bị trùng", "Quá nhiều yêu cầu", "Lỗi máy chủ", "Yêu cầu không thành công"];

    private static readonly string[] Projects = ["TaskManagement.Domain", "TaskManagement.Application", "TaskManagement.API"];

    [GeneratedRegex("\"((?:[^\"\\\\]|\\\\.)*)\"")]
    private static partial Regex StringLiteral();

    [GeneratedRegex("[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìĩóòõúùũýỳ]", RegexOptions.IgnoreCase)]
    private static partial Regex VietnameseLetter();

    private static IEnumerable<(string File, string Message)> Messages()
    {
        var files = Projects
            .SelectMany(project => Directory.EnumerateFiles(Path.Combine(BackendRoot, "src", project), "*.cs", SearchOption.AllDirectories))
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !f.EndsWith("ProblemMessages.cs", StringComparison.Ordinal)
                     && !f.EndsWith($"{Path.DirectorySeparatorChar}Program.cs", StringComparison.Ordinal)); // Swagger help text, not a response

        foreach (var file in files)
        {
            foreach (var line in File.ReadLines(file))
            {
                if (line.TrimStart().StartsWith("//", StringComparison.Ordinal) || line.TrimStart().StartsWith("///", StringComparison.Ordinal))
                {
                    continue;
                }

                foreach (Match match in StringLiteral().Matches(line))
                {
                    var text = match.Groups[1].Value;
                    if (VietnameseLetter().IsMatch(text) && !Titles.Contains(text))
                    {
                        // "{TaskItem.TitleMaxLength}" is filled with a number at run time.
                        yield return (Path.GetFileName(file), Regex.Replace(text, @"\{[^}]+\}", "100"));
                    }
                }
            }
        }
    }

    [Fact]
    public void The_scan_finds_the_messages_it_is_meant_to_guard()
    {
        Assert.True(Messages().Count() > 40, "The source scan found too few messages; the scan is probably broken.");
    }

    [Fact]
    public void Every_vietnamese_message_in_the_backend_has_an_english_translation()
    {
        var missing = Messages().Where(m => ProblemMessages.TryTranslate(m.Message) is null).Select(m => $"{m.File}: {m.Message}").Distinct().ToList();

        Assert.True(missing.Count == 0, "No English translation in ProblemMessages for:\n" + string.Join("\n", missing));
    }

    private static string FindBackendRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "TaskManagement.slnx")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? throw new InvalidOperationException("Could not locate backend/TaskManagement.slnx.");
    }
}
