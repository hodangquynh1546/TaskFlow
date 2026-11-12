using FluentValidation.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.ComponentModel.DataAnnotations;
using TaskManagement.Application.Abstractions;
using TaskManagement.Application.Common;
using TaskManagement.Domain.Enums;
using TaskManagement.Domain.Exceptions;

namespace TaskManagement.IntegrationTests.Infrastructure;

public sealed record ProbeBody(TaskPriority Priority, [Range(1, 10)] int Count);

/// <summary>Test-only endpoints that drive the real middleware pipeline. Not part of the shipped API.</summary>
[ApiController]
[Route("test")]
public sealed class PipelineProbeController(ICurrentUser currentUser) : ControllerBase
{
    [HttpGet("me")]
    public IActionResult Me() => Ok(new { userId = currentUser.UserId });

    [HttpGet("public"), AllowAnonymous]
    public IActionResult Public() => Ok(new { ok = true });

    [HttpGet("throw/{kind}"), AllowAnonymous]
    public IActionResult Throw(string kind) => throw (kind switch
    {
        "domain" => new DomainException("Ngày bắt đầu không được sau hạn hoàn thành.", "startDate"),
        "domain-nofield" => new DomainException("Vi phạm quy tắc."),
        "notfound" => new NotFoundException("Không tìm thấy công việc."),
        "conflict" => new ConflictException("Email đã được sử dụng.", "email"),
        "unauthorized" => new UnauthorizedException("Email hoặc mật khẩu không đúng."),
        "validation" => new FluentValidation.ValidationException(
        [
            new ValidationFailure("Title", "Tiêu đề không được để trống."),
            new ValidationFailure("DueDate", "Hạn hoàn thành không hợp lệ."),
            new ValidationFailure("Title", "Tiêu đề quá dài."),
        ]),
        _ => new InvalidOperationException("SECRET-INTERNAL-DETAIL connection string password=hunter2"),
    });

    [HttpPost("body"), AllowAnonymous]
    public IActionResult Body(ProbeBody body) => Ok(body);

    [HttpPost("limited"), AllowAnonymous, EnableRateLimiting("auth")]
    public IActionResult Limited() => Ok(new { ok = true });
}
