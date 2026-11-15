using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.API.Localization;
using TaskManagement.Application.Data;

namespace TaskManagement.API.Controllers;

/// <summary>Taking the user's own tasks out as a file, and bringing a file in.</summary>
[ApiController]
[Route("api/data")]
public sealed class DataController(IDataPortService data) : ControllerBase
{
    private static readonly JsonSerializerOptions Pretty = new(JsonSerializerDefaults.Web) { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };

    /// <summary>A download. CSV starts with a byte order mark so Excel reads the Vietnamese text as UTF-8.</summary>
    [HttpGet("export")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Export([FromQuery] string format = "json", CancellationToken cancellationToken = default)
    {
        if (!Enum.TryParse<DataFormat>(format, true, out var kind))
        {
            ModelState.AddModelError("format", "Định dạng nhập phải là json hoặc csv.");
            return ValidationProblem(ModelState);
        }

        var file = await data.ExportAsync(cancellationToken);
        var stamp = file.ExportedAt.ToString("yyyyMMdd-HHmm", System.Globalization.CultureInfo.InvariantCulture);
        return kind == DataFormat.Csv
            ? File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(TaskCsv.Write(file.Tasks))).ToArray(), "text/csv; charset=utf-8", $"taskflow-{stamp}.csv")
            : File(JsonSerializer.SerializeToUtf8Bytes(file, Pretty), "application/json", $"taskflow-{stamp}.json");
    }

    [HttpPost("import")]
    [ProducesResponseType<ImportResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ImportResultDto>> Import(ImportRequest request, CancellationToken cancellationToken)
    {
        var result = await data.ImportAsync(request, cancellationToken);
        var language = ProblemMessages.Resolve(Request);
        // Row messages are plain text, not a problem body, so they are put in the reader's language here.
        return result with { Errors = result.Errors.Select(e => e with { Message = ProblemMessages.Translate(e.Message, language) }).ToList() };
    }
}
