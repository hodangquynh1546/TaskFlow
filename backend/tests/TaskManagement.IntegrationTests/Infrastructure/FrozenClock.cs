namespace TaskManagement.IntegrationTests.Infrastructure;

/// <summary>
/// A clock that stands still at a chosen instant so "overdue" and "due within N days" boundaries are exact.
/// Start it near the real time: JWT lifetime checks use the system clock and would reject tokens issued far from it.
/// </summary>
public sealed class FrozenClock : TimeProvider
{
    public FrozenClock()
    {
        var real = DateTimeOffset.UtcNow;
        Now = new DateTimeOffset(real.Year, real.Month, real.Day, real.Hour, real.Minute, real.Second, TimeSpan.Zero);
    }

    public DateTimeOffset Now { get; private set; }

    /// <summary>Moves time forward, for tokens that expire in days.</summary>
    public void Advance(TimeSpan by) => Now += by;

    public override DateTimeOffset GetUtcNow() => Now;
}
