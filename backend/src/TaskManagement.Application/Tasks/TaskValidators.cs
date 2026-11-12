using FluentValidation;
using TaskManagement.Domain.Entities;

namespace TaskManagement.Application.Tasks;

internal static class TaskRules
{
    public static IRuleBuilderOptions<T, string> ValidTitle<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(t => !string.IsNullOrWhiteSpace(t)).WithMessage("Tiêu đề không được để trống.")
            .Must(t => t is null || t.Trim().Length <= TaskItem.TitleMaxLength).WithMessage($"Tiêu đề tối đa {TaskItem.TitleMaxLength} ký tự.");

    public static IRuleBuilderOptions<T, string?> ValidDescription<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(TaskItem.DescriptionMaxLength).WithMessage($"Mô tả tối đa {TaskItem.DescriptionMaxLength} ký tự.");

    public static IRuleBuilderOptions<T, int?> ValidDuration<T>(this IRuleBuilder<T, int?> rule) =>
        rule.InclusiveBetween(1, TaskItem.MaxDurationMinutes)
            .WithMessage($"Thời lượng phải từ 1 đến {TaskItem.MaxDurationMinutes} phút.");
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
        RuleFor(x => x.StartDate).Must((x, start) => start!.Value <= x.DueDate!.Value)
            .When(x => x.StartDate.HasValue && x.DueDate.HasValue)
            .WithMessage("Ngày bắt đầu không được sau hạn hoàn thành.");
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
        RuleFor(x => x.StartDate).Must((x, start) => start!.Value <= x.DueDate!.Value)
            .When(x => x.StartDate.HasValue && x.DueDate.HasValue)
            .WithMessage("Ngày bắt đầu không được sau hạn hoàn thành.");
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
