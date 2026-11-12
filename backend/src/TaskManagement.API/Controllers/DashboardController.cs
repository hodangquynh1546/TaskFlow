using Microsoft.AspNetCore.Mvc;
using TaskManagement.Application.Dashboard;
using TaskManagement.Application.Tasks;

namespace TaskManagement.API.Controllers;

[ApiController]
[Route("api/dashboard")]
public sealed class DashboardController(IDashboardService dashboard) : ControllerBase
{
    [HttpGet("summary")]
    [ProducesResponseType<DashboardSummaryDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<DashboardSummaryDto>> Summary(CancellationToken cancellationToken) =>
        await dashboard.GetSummaryAsync(cancellationToken);

    [HttpGet("upcoming-tasks")]
    [ProducesResponseType<IReadOnlyList<TaskDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IReadOnlyList<TaskDto>>> Upcoming([FromQuery] UpcomingTasksQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboard.GetUpcomingAsync(query, cancellationToken));

    [HttpGet("recent-tasks")]
    [ProducesResponseType<IReadOnlyList<TaskDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IReadOnlyList<TaskDto>>> Recent([FromQuery] RecentTasksQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboard.GetRecentAsync(query, cancellationToken));
}
