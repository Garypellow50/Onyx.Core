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
      className={cn(
        "flex shrink-0 items-center rounded-full border border-hairline bg-inset p-0.5",
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
            "flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors [@media(pointer:coarse)]:size-11 hover:text-foreground",
            value === id && "bg-background text-primary shadow-sm",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
