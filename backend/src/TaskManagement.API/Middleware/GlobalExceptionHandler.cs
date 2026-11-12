using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.API.Extensions;
using TaskManagement.Application.Common;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.API.Middleware;

/// <summary>Single place that turns exceptions into RFC 7807 responses. Unexpected errors never leak details to the client.</summary>
internal sealed partial class GlobalExceptionHandler(
    IProblemDetailsService problemDetails,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        // The client went away; nothing to report and nobody to report it to.
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            return true;
        }

        var (status, detail, errors) = Map(exception);

        if (status >= StatusCodes.Status500InternalServerError)
        {
            LogUnhandled(exception, httpContext.Request.Method, httpContext.Request.Path);
        }
        else
        {
            var exceptionType = exception.GetType();
            LogRejected(status, exceptionType);
        }

        httpContext.Response.StatusCode = status;
        ProblemDetails problem = errors is null
            ? new ProblemDetails { Status = status, Detail = detail }
            : new ValidationProblemDetails(errors) { Status = status, Detail = detail };

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = problem,
        });
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Unhandled exception on {Method} {Path}")]
    private partial void LogUnhandled(Exception exception, string method, PathString path);

    [LoggerMessage(Level = LogLevel.Information, Message = "Request rejected with {Status}: {ExceptionType}")]
    private partial void LogRejected(int status, Type exceptionType);

    private static (int Status, string Detail, Dictionary<string, string[]>? Errors) Map(Exception exception) => exception switch
    {
        ValidationException v => (
            StatusCodes.Status400BadRequest,
            "Một hoặc nhiều trường không hợp lệ.",
            v.Errors
                .GroupBy(e => ProblemDetailsExtensions.ToFieldName(e.PropertyName))
                .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray())),
        DomainException d => (
            StatusCodes.Status400BadRequest,
            d.Message,
            d.Field is null ? null : new Dictionary<string, string[]> { [d.Field] = [d.Message] }),
        NotFoundException n => (StatusCodes.Status404NotFound, n.Message, null),
        ConflictException c => (
            StatusCodes.Status409Conflict,
            c.Message,
            c.Field is null ? null : new Dictionary<string, string[]> { [c.Field] = [c.Message] }),
        UnauthorizedException u => (StatusCodes.Status401Unauthorized, u.Message, null),
        BadHttpRequestException b => (b.StatusCode, "Yêu cầu không hợp lệ.", null),
        _ => (StatusCodes.Status500InternalServerError, "Đã có lỗi xảy ra. Vui lòng thử lại sau.", null),
    };
}
