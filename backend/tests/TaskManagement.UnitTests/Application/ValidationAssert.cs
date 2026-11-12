using FluentValidation;

namespace TaskManagement.UnitTests.Application;

internal static class ValidationAssert
{
    public static Dictionary<string, string[]> Errors<T>(IValidator<T> validator, T instance) =>
        validator.Validate(instance).Errors
            .GroupBy(e => e.PropertyName)
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());

    public static void Valid<T>(IValidator<T> validator, T instance)
    {
        var errors = Errors(validator, instance);
        Assert.True(errors.Count == 0, "Expected valid but got: " + string.Join("; ", errors.Select(e => $"{e.Key}: {string.Join(" / ", e.Value)}")));
    }

    public static void InvalidOn<T>(IValidator<T> validator, T instance, string property)
    {
        var errors = Errors(validator, instance);
        Assert.True(errors.ContainsKey(property), $"Expected an error on '{property}' but got: {string.Join(", ", errors.Keys)}");
    }
}
