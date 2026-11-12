using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using TaskManagement.API.Localization;

namespace TaskManagement.API.Extensions;

internal static class ProblemDetailsExtensions
{
    private const string BodyField = "body";

    private static readonly Dictionary<int, string> Titles = new()
    {
        [StatusCodes.Status400BadRequest] = "Dữ liệu không hợp lệ",
        [StatusCodes.Status401Unauthorized] = "Chưa đăng nhập",
        [StatusCodes.Status404NotFound] = "Không tìm thấy",
        [StatusCodes.Status409Conflict] = "Dữ liệu bị trùng",
        [StatusCodes.Status429TooManyRequests] = "Quá nhiều yêu cầu",
        [StatusCodes.Status500InternalServerError] = "Lỗi máy chủ",
    };

    public static string TitleFor(int status) =>
        Titles.GetValueOrDefault(status, "Yêu cầu không thành công");

    /// <summary>Camel-cases "Title" or "Task.DueDate" or "$.priority" so error keys match the JSON field names clients send.</summary>
    public static string ToFieldName(string key)
    {
        var path = key.StartsWith("$.", StringComparison.Ordinal) ? key[2..] : key;
        var parts = path.Split('.', StringSplitOptions.RemoveEmptyEntries);
        return string.Join('.', parts.Select(p => p.Length == 0 ? p : char.ToLowerInvariant(p[0]) + p[1..]));
    }

    public static IServiceCollection AddApiProblemDetails(this IServiceCollection services)
    {
        services.AddProblemDetails(options =>
            options.CustomizeProblemDetails = context =>
            {
                var problem = context.ProblemDetails;
                var status = problem.Status ?? context.HttpContext.Response.StatusCode;
                problem.Title = ProblemMessages.TitleFor(status, TitleFor(status), ProblemMessages.Resolve(context.HttpContext.Request));
                ProblemMessages.Localize(context.HttpContext, problem);
                problem.Instance ??= context.HttpContext.Request.Path;
                problem.Extensions["traceId"] = Activity.Current?.Id ?? context.HttpContext.TraceIdentifier;
            });

        // Model-binding failures (malformed JSON, wrong types, bad query values) share the validation error shape.
        // Framework messages are English and expose internal type names, so they are replaced with a generic one;
        // meaningful messages come from the services' FluentValidation validators, which never pass through here.
        services.Configure<ApiBehaviorOptions>(options =>
            options.InvalidModelStateResponseFactory = context =>
            {
                var fields = context.ModelState
                    .Where(e => e.Value is { Errors.Count: > 0 })
                    .Select(e => ToFieldName(e.Key))
                    .Select(k => k is "" or "$" ? BodyField : k)
                    .Distinct()
                    .ToList();

                // The framework adds a redundant "body is required" entry next to the real field errors.
                if (fields.Count > 1)
                {
                    fields.Remove(BodyField);
                }

                var modelState = new ModelStateDictionary();
                foreach (var field in fields)
                {
                    modelState.AddModelError(field, field == BodyField ? "Nội dung yêu cầu không hợp lệ." : "Giá trị không hợp lệ.");
                }

                var factory = context.HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
                var problem = factory.CreateValidationProblemDetails(
                    context.HttpContext,
                    modelState,
                    StatusCodes.Status400BadRequest,
                    title: TitleFor(StatusCodes.Status400BadRequest),
                    detail: "Một hoặc nhiều trường không hợp lệ.");

                problem.Title = ProblemMessages.TitleFor(StatusCodes.Status400BadRequest, problem.Title ?? string.Empty, ProblemMessages.Resolve(context.HttpContext.Request));
                ProblemMessages.Localize(context.HttpContext, problem);
                return new BadRequestObjectResult(problem);
            });

        return services;
    }
}
