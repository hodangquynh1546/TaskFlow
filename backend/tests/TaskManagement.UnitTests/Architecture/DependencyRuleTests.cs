using System.Xml.Linq;

namespace TaskManagement.UnitTests.Architecture;

/// <summary>Guards the Clean Architecture dependency rule by reading the real project files.</summary>
public class DependencyRuleTests
{
    private static readonly string BackendRoot = FindBackendRoot();

    [Theory]
    [InlineData("TaskManagement.Domain", new string[0])]
    [InlineData("TaskManagement.Application", new[] { "TaskManagement.Domain" })]
    [InlineData("TaskManagement.Infrastructure", new[] { "TaskManagement.Application" })]
    [InlineData("TaskManagement.API", new[] { "TaskManagement.Application", "TaskManagement.Infrastructure" })]
    public void Project_references_only_allowed_projects(string project, string[] allowed)
    {
        var actual = ProjectReferences(project);

        Assert.Equal(allowed.Order(), actual.Order());
    }

    [Theory]
    [InlineData("TaskManagement.Domain")]
    [InlineData("TaskManagement.Application")]
    public void Inner_layers_do_not_use_infrastructure_packages(string project)
    {
        var forbidden = new[] { "Npgsql", "Microsoft.AspNetCore", "Swashbuckle", "Microsoft.IdentityModel", "Microsoft.EntityFrameworkCore.Design" };

        var packages = PackageReferences(project);

        Assert.DoesNotContain(packages, p => forbidden.Any(f => p.StartsWith(f, StringComparison.OrdinalIgnoreCase)));
    }

    [Fact]
    public void Domain_has_no_package_dependencies()
    {
        Assert.Empty(PackageReferences("TaskManagement.Domain"));
    }

    private static string[] ProjectReferences(string project) =>
        Load(project).Descendants("ProjectReference")
            .Select(e => Path.GetFileNameWithoutExtension(((string)e.Attribute("Include")!).Replace('\\', '/')))
            .ToArray();

    private static string[] PackageReferences(string project) =>
        Load(project).Descendants("PackageReference").Select(e => (string)e.Attribute("Include")!).ToArray();

    private static XDocument Load(string project) =>
        XDocument.Load(Path.Combine(BackendRoot, "src", project, project + ".csproj"));

    private static string FindBackendRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "TaskManagement.slnx")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName ?? throw new InvalidOperationException("Could not locate backend/TaskManagement.slnx.");
    }
}
