using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using TaskManagement.Application.Auth;
using TaskManagement.Application.Dashboard;
using TaskManagement.Application.Tasks;
using TaskManagement.Application.Users;

namespace TaskManagement.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IUserProfileService, UserProfileService>();
        services.AddScoped<ITaskService, TaskService>();
        services.AddScoped<IDashboardService, DashboardService>();

        // Every AbstractValidator<T> in this assembly is registered as IValidator<T> (stateless, so singleton).
        var validators = typeof(DependencyInjection).Assembly.GetTypes()
            .Where(t => t is { IsAbstract: false, BaseType: { IsGenericType: true } } && t.BaseType.GetGenericTypeDefinition() == typeof(AbstractValidator<>));
        foreach (var validator in validators)
        {
            services.AddSingleton(typeof(IValidator<>).MakeGenericType(validator.BaseType!.GetGenericArguments()[0]), validator);
        }

        return services;
    }
}
