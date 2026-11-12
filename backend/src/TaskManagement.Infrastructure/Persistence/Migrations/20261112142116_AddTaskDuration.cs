using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManagement.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskDuration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DurationMinutes",
                table: "Tasks",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_UserId_StartDate",
                table: "Tasks",
                columns: new[] { "UserId", "StartDate" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tasks_DurationMinutes",
                table: "Tasks",
                sql: "\"DurationMinutes\" IS NULL OR \"DurationMinutes\" BETWEEN 1 AND 1440");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tasks_UserId_StartDate",
                table: "Tasks");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tasks_DurationMinutes",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "DurationMinutes",
                table: "Tasks");
        }
    }
}
