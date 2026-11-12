using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using TaskManagement.Application;
using TaskManagement.Application.Auth;
using TaskManagement.Application.Tasks;
using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;

namespace TaskManagement.UnitTests.Application;

public class DtoAndRegistrationTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 12, 9, 0, 0, TimeSpan.Zero);
    private static readonly Guid Owner = Guid.NewGuid();

    [Fact]
    public void UserDto_exposes_no_password_data()
    {
        var names = typeof(UserDto).GetProperties().Select(p => p.Name).ToArray();

        Assert.DoesNotContain(names, n => n.Contains("Password", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(names, n => n.Contains("Hash", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void UserDto_copies_the_public_fields()
    {
        var user = User.Create("An", "a@b.co", "secret-hash", Now);

        var dto = UserDto.From(user);

        Assert.Equal((user.Id, "An", "a@b.co", Now, Now), (dto.Id, dto.FullName, dto.Email, dto.CreatedAt, dto.UpdatedAt));
    }

    [Fact]
    public void TaskDto_does_not_expose_the_owner()
    {
        Assert.DoesNotContain(typeof(TaskDto).GetProperties(), p => p.Name.Contains("User", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData(TaskItemStatus.Todo, -1, true)]
    [InlineData(TaskItemStatus.Completed, -1, false)]
    [InlineData(TaskItemStatus.InProgress, 0, false)]
    [InlineData(TaskItemStatus.InProgress, 1, false)]
    public void TaskDto_computes_IsOverdue_against_the_supplied_clock(TaskItemStatus status, int dueOffsetSeconds, bool expected)
    {
        var task = TaskItem.Create(Owner, "x", null, null, status, null, Now.AddSeconds(dueOffsetSeconds), Now.AddDays(-1));

        Assert.Equal(expected, TaskDto.From(task, Now).IsOverdue);
    }

    [Fact]
    public void TaskDto_maps_every_field()
    {
        var task = TaskItem.Create(Owner, "Tiêu đề", "mô tả", TaskPriority.High, TaskItemStatus.InProgress, Now, Now.AddDays(1), Now);

        var dto = TaskDto.From(task, Now);

        Assert.Equal(task.Id, dto.Id);
        Assert.Equal("Tiêu đề", dto.Title);
        Assert.Equal("mô tả", dto.Description);
        Assert.Equal(TaskPriority.High, dto.Priority);
        Assert.Equal(TaskItemStatus.InProgress, dto.Status);
        Assert.Equal(Now, dto.StartDate);
        Assert.Equal(Now.AddDays(1), dto.DueDate);
        Assert.Equal(Now, dto.CreatedAt);
        Assert.Equal(Now, dto.UpdatedAt);
    }

    [Fact]
    public void TaskDto_carries_the_duration_or_null()
    {
        var withDuration = TaskItem.Create(Owner, "x", null, null, null, Now, null, Now, 90);
        var without = TaskItem.Create(Owner, "x", null, null, null, null, null, Now);

        Assert.Equal(90, TaskDto.From(withDuration, Now).DurationMinutes);
        Assert.Null(TaskDto.From(without, Now).DurationMinutes);
    }

    [Fact]
    public void Every_validator_in_the_assembly_is_registered_and_resolvable()
    {
        var services = new ServiceCollection();
        services.AddApplication();
        using var provider = services.BuildServiceProvider();

        var validatorTypes = typeof(DependencyInjection).Assembly.GetTypes()
            .Where(t => !t.IsAbstract && t.BaseType is { IsGenericType: true } b && b.GetGenericTypeDefinition() == typeof(AbstractValidator<>))
            .ToList();

        Assert.NotEmpty(validatorTypes);
        foreach (var type in validatorTypes)
        {
            var requestType = type.BaseType!.GetGenericArguments()[0];
            var resolved = provider.GetService(typeof(IValidator<>).MakeGenericType(requestType));
            Assert.NotNull(resolved);
            Assert.IsType(type, resolved);
        }
    }
}
