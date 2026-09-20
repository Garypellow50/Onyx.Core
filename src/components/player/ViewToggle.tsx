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
        "flex shrink-0 items-center gap-1 rounded-2xl border border-hairline bg-panel p-1",
        className,
      )}
    >
      {MODES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-label={label}
          aria-pressed={value === id}
          title={label}
          className={cn(
            "flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            value === id && "bg-inset text-primary shadow-sm",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
