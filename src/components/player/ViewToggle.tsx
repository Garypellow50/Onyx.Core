import { LayoutGrid, List, Rows3 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid" | "xl";

const MODES: { id: ViewMode; label: string; Icon: typeof List }[] = [
  { id: "list", label: "List", Icon: List },
  { id: "grid", label: "Large tiles", Icon: LayoutGrid },
  { id: "xl", label: "Extra large tiles", Icon: Rows3 },
];

/** Compact segmented control for switching between list and tile layouts. */
export function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="View layout"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      className={cn("flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-background/40 p-0.5", className)}
    >
      {MODES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-label={label}
          title={label}
          aria-pressed={value === id}
          className={cn(
            "flex size-10 min-h-10 min-w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === id
              ? "bg-muted text-primary"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
