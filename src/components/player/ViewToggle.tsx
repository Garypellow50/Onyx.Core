import { LayoutGrid, List, Rows3 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid" | "xl";

const MODES: { id: ViewMode; label: string; Icon: typeof List }[] = [
  { id: "list", label: "List", Icon: List },
  { id: "grid", label: "Large tiles", Icon: LayoutGrid },
  { id: "xl", label: "Extra large tiles", Icon: Rows3 },
];

/** Accessible segmented control for switching between list and tile layouts. */
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
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-card p-0.5",
        className,
      )}
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
            "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground sm:size-10",
            value === id && "bg-accent text-primary",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
