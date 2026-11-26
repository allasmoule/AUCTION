import { cn, formatTimer } from "@/lib/utils";

export function CountdownTimer({
  remainingSeconds,
  totalSeconds,
  isPaused,
  compact = false,
}: {
  remainingSeconds: number;
  totalSeconds: number;
  isPaused?: boolean;
  compact?: boolean;
}) {
  const safeTotal = Math.max(1, totalSeconds || 60);
  const progress = Math.min(1, Math.max(0, remainingSeconds / safeTotal));
  const isUrgent = !isPaused && remainingSeconds > 0 && remainingSeconds <= 10;

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-display text-3xl tracking-wider",
          isPaused
            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
            : isUrgent
              ? "border-red-500 bg-red-500/20 text-red-400 animate-pulse"
              : "border-primary/40 bg-primary/10 text-primary"
        )}
      >
        <span>{isPaused ? "PAUSED" : formatTimer(remainingSeconds)}</span>
      </div>
    );
  }

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 132 132">
          <circle
            cx="66"
            cy="66"
            r={radius}
            fill="none"
            stroke="hsl(230 25% 18%)"
            strokeWidth="10"
          />
          <circle
            cx="66"
            cy="66"
            r={radius}
            fill="none"
            stroke={isPaused ? "#F59E0B" : isUrgent ? "#EF4444" : "#FABD2F"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-display text-4xl sm:text-5xl tracking-wider leading-none",
              isPaused ? "text-amber-400" : isUrgent ? "text-red-400 animate-pulse" : "text-primary"
            )}
          >
            {formatTimer(remainingSeconds)}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mt-1">
            {isPaused ? "PAUSED" : isUrgent ? "GOING ONCE..." : "TIME LEFT"}
          </span>
        </div>
      </div>
    </div>
  );
}
