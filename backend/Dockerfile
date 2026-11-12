# Build context: ./backend
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/TaskManagement.API/TaskManagement.API.csproj -c Release -o /out /p:UseAppHost=false

# One-off schema migration: docker compose --profile tools run --rm migrate
FROM build AS migrate
RUN dotnet tool restore
ENTRYPOINT ["dotnet", "tool", "run", "dotnet-ef", "database", "update", "--project", "src/TaskManagement.Infrastructure", "--startup-project", "src/TaskManagement.API"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "TaskManagement.API.dll"]
