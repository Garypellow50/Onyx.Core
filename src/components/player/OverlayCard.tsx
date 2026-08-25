import { type ReactNode } from "react";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersisted } from "@/lib/player/ui-state";

/**
 * Dismissible/minimizable panel for anything drawn over the video stage.
 * Collapsed state shrinks to a small pill so progress stays visible without
 * covering the picture; dismissing hides it for the rest of this pass.
 */
export function OverlayCard({
  title,
  badge,
  tone = "default",
  className,
  persistKey,
  children,
}: {
  title: string;
  badge?: string;
  tone?: "default" | "destructive";
  className?: string;
  /** Stable id so minimise/dismiss survives rotation, resize and reloads. */
  persistKey?: string;
  children: ReactNode;
}) {
  const id = persistKey ?? title.toLowerCase().replace(/\s+/g, "-");
  const [minimized, setMinimized] = usePersisted(`overlay:${id}:minimized`, false);
  const [dismissed, setDismissed] = usePersisted(`overlay:${id}:dismissed`, false);
  if (dismissed) return null;

  const accent = tone === "destructive" ? "text-destructive" : "text-primary";
  const border = tone === "destructive" ? "border-destructive/60" : "border-hairline";

  if (minimized) {
    return (
      <div className={cn("absolute z-20", className)}>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-sm border bg-background/90 px-2.5 py-1 backdrop-blur-sm transition-colors hover:bg-background",
            border,
          )}
        >
          <span className={cn("label-machined text-[9px]", accent)}>{title}</span>
          {badge && <span className="readout text-[10px] text-foreground">{badge}</span>}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute z-20 rounded-sm border bg-background/90 p-3 backdrop-blur-sm",
        border,
        className,
      )}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className={cn("label-machined", accent)}>{title}</p>
        <div className="flex items-center gap-2">
          {badge && <span className="readout text-[10px] text-foreground">{badge}</span>}
          <button
            type="button"
            aria-label={`Minimize ${title}`}
            onClick={() => setMinimized(true)}
            className="-m-1.5 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Dismiss ${title}`}
            onClick={() => setDismissed(true)}
            className="-m-1.5 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
