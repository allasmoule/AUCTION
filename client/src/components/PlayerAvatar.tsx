import { cn, getInitials } from "@/lib/utils";

export function PlayerAvatar({
  src,
  name,
  className,
  size = "md",
}: {
  src?: string | null;
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "h-10 w-10 text-xs",
    md: "h-14 w-14 text-base",
    lg: "h-24 w-24 text-2xl",
    xl: "h-56 w-56 sm:h-72 sm:w-72 text-5xl",
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(
          "rounded-xl object-cover border border-primary/30 bg-secondary shrink-0",
          sizes[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/30 bg-gradient-to-br from-secondary to-background flex items-center justify-center font-display tracking-wider text-primary shrink-0",
        sizes[size],
        className
      )}
    >
      {getInitials(name || "NB3")}
    </div>
  );
}
