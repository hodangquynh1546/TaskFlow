using FluentValidation;
using TaskManagement.Domain.Entities;
using TaskManagement.Domain.Enums;

namespace TaskManagement.Application.Tasks;

internal static class TaskRules
{
    public static IRuleBuilderOptions<T, string> ValidTitle<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(t => !string.IsNullOrWhiteSpace(t)).WithMessage("Tiêu đề không được để trống.")
            .Must(t => t is null || t.Trim().Length <= TaskItem.TitleMaxLength).WithMessage($"Tiêu đề tối đa {TaskItem.TitleMaxLength} ký tự.");

    public static IRuleBuilderOptions<T, string?> ValidDescription<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(TaskItem.DescriptionMaxLength).WithMessage($"Mô tả tối đa {TaskItem.DescriptionMaxLength} ký tự.");

    /// <summary>A repeat needs a start time to repeat from, and its own numbers must make sense.</summary>
    public static void ValidRepeat<T>(this AbstractValidator<T> validator) where T : IRecurringRequest
    {
        validator.RuleFor(x => x.Recurrence).SetValidator(new RecurrenceDtoValidator()!).When(x => x.Recurrence is not null);
        validator.RuleFor(x => x.Recurrence).Must((x, _) => x.StartDate.HasValue)
            .When(x => x.Recurrence is not null)
            .WithMessage("Việc lặp lại cần có giờ bắt đầu.");
        validator.RuleFor(x => x.Recurrence).Must((x, r) => EndsOnOrAfterStart(r!, x.StartDate!.Value))
            .When(x => x.Recurrence is { Until: not null, UtcOffsetMinutes: >= -Recurrence.MaxOffsetMinutes and <= Recurrence.MaxOffsetMinutes } && x.StartDate.HasValue)
            .WithMessage("Ngày kết thúc lặp không được trước ngày bắt đầu.");
    }

    private static bool EndsOnOrAfterStart(RecurrenceDto repeat, DateTimeOffset start)
    {
        var offset = TimeSpan.FromMinutes(repeat.UtcOffsetMinutes);
        return repeat.Until!.Value.ToOffset(offset).Date >= start.ToOffset(offset).Date;
    }

    public static IRuleBuilderOptions<T, int?> ValidDuration<T>(this IRuleBuilder<T, int?> rule) =>
        rule.InclusiveBetween(1, TaskItem.MaxDurationMinutes)
            .WithMessage($"Thời lượng phải từ 1 đến {TaskItem.MaxDurationMinutes} phút.");
}

public sealed class RecurrenceDtoValidator : AbstractValidator<RecurrenceDto>
{
    public RecurrenceDtoValidator()
    {
        RuleFor(x => x.Frequency).IsInEnum().WithMessage("Kiểu lặp không hợp lệ.");
        RuleFor(x => x.Interval).InclusiveBetween(1, Recurrence.MaxInterval).WithMessage($"Khoảng lặp phải từ 1 đến {Recurrence.MaxInterval}.");
        RuleFor(x => x.Weekdays).InclusiveBetween(0, Recurrence.AllWeekdays).WithMessage("Ngày lặp trong tuần không hợp lệ.");
        RuleFor(x => x.Weekdays).Equal(0).When(x => x.Frequency != RecurrenceFrequency.Weekly).WithMessage("Ngày lặp trong tuần không hợp lệ.");
        RuleFor(x => x.UtcOffsetMinutes).InclusiveBetween(-Recurrence.MaxOffsetMinutes, Recurrence.MaxOffsetMinutes).WithMessage("Múi giờ không hợp lệ.");
    }
}

public sealed class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator()
    {
        RuleFor(x => x.Title).ValidTitle();
        RuleFor(x => x.Description).ValidDescription();
        RuleFor(x => x.DurationMinutes).ValidDuration().When(x => x.DurationMinutes.HasValue);
        RuleFor(x => x.Priority).IsInEnum().When(x => x.Priority.HasValue).WithMessage("Mức ưu tiên không hợp lệ.");
        RuleFor(x => x.Status).IsInEnum().When(x => x.Status.HasValue).WithMessage("Trạng thái không hợp lệ.");
        this.ValidRepeat();
    }
}

public sealed class UpdateTaskRequestValidator : AbstractValidator<UpdateTaskRequest>
{
    public UpdateTaskRequestValidator()
    {
        RuleFor(x => x.Title).ValidTitle();
        RuleFor(x => x.Description).ValidDescription();
        RuleFor(x => x.DurationMinutes).ValidDuration().When(x => x.DurationMinutes.HasValue);
        RuleFor(x => x.Priority).NotNull().WithMessage("Mức ưu tiên là bắt buộc.")
            .IsInEnum().WithMessage("Mức ưu tiên không hợp lệ.");
        RuleFor(x => x.Status).NotNull().WithMessage("Trạng thái là bắt buộc.")
            .IsInEnum().WithMessage("Trạng thái không hợp lệ.");
        this.ValidRepeat();
    }
}

public sealed class TitleSuggestionsQueryValidator : AbstractValidator<TitleSuggestionsQuery>
{
    public TitleSuggestionsQueryValidator()
    {
        RuleFor(x => x.Prefix).MaximumLength(TaskItem.TitleMaxLength).WithMessage($"Tiêu đề tối đa {TaskItem.TitleMaxLength} ký tự.");
        RuleFor(x => x.Limit).InclusiveBetween(1, TitleSuggestionsQuery.MaxLimit).WithMessage($"Số mục phải từ 1 đến {TitleSuggestionsQuery.MaxLimit}.");
    }
}

public sealed class ChangeStatusRequestValidator : AbstractValidator<ChangeStatusRequest>
{
    public ChangeStatusRequestValidator()
    {
        RuleFor(x => x.Status).NotNull().WithMessage("Trạng thái là bắt buộc.")
            .IsInEnum().WithMessage("Trạng thái không hợp lệ.");
    }
}

public sealed class TaskQueryValidator : AbstractValidator<TaskQuery>
{
    public TaskQueryValidator()
    {
        RuleFor(x => x.Search).MaximumLength(TaskQuery.MaxSearchLength).WithMessage($"Từ khóa tối đa {TaskQuery.MaxSearchLength} ký tự.");
        RuleFor(x => x.Status).IsInEnum().When(x => x.Status.HasValue).WithMessage("Trạng thái không hợp lệ.");
        RuleFor(x => x.Priority).IsInEnum().When(x => x.Priority.HasValue).WithMessage("Mức ưu tiên không hợp lệ.");
        RuleFor(x => x.SortBy).IsInEnum().WithMessage("Trường sắp xếp không hợp lệ.");
        RuleFor(x => x.SortDir).IsInEnum().WithMessage("Chiều sắp xếp không hợp lệ.");
        RuleFor(x => x.Page).InclusiveBetween(1, TaskQuery.MaxPage).WithMessage($"Trang phải từ 1 đến {TaskQuery.MaxPage}.");
        RuleFor(x => x.PageSize).InclusiveBetween(1, TaskQuery.MaxPageSize).WithMessage($"Số mục mỗi trang phải từ 1 đến {TaskQuery.MaxPageSize}.");
        RuleFor(x => x.DueFrom).Must((x, from) => from!.Value <= x.DueTo!.Value)
            .When(x => x.DueFrom.HasValue && x.DueTo.HasValue)
            .WithMessage("Ngày bắt đầu lọc không được sau ngày kết thúc lọc.");
        RuleFor(x => x.StartFrom).Must((x, from) => from!.Value <= x.StartTo!.Value)
            .When(x => x.StartFrom.HasValue && x.StartTo.HasValue)
            .WithMessage("Giờ bắt đầu lọc không được sau giờ kết thúc lọc.");
    }
}
