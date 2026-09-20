import { useMemo, useState } from "react";
import { ChevronDown, Copy, Download, Eraser, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";
import { clearLog, exportLog, useLog, type LogLevel } from "@/lib/player/log";

const LEVELS: { key: LogLevel | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "debug", label: "Debug" },
  { key: "info", label: "Info" },
  { key: "success", label: "OK" },
  { key: "warn", label: "Warn" },
  { key: "error", label: "Error" },
];

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  success: "text-chart-2",
  warn: "text-chart-4",
  error: "text-destructive",
};

export function LogPanel() {
  const entries = useLog();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [copyStatus, setCopyStatus] = useState("");
  const panelId = "player-activity-log";

  const visible = useMemo(
    () =>
      filter === "all"
        ? entries
        : entries.filter((entry) => entry.level === filter),
    [entries, filter],
  );
  const errorCount = entries.filter((entry) => entry.level === "error").length;

  async function copyAll() {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Clipboard access is unavailable.");
      return;
    }
    try {
      await navigator.clipboard.writeText(exportLog());
      setCopyStatus("Activity log copied.");
    } catch {
      setCopyStatus("Could not copy the activity log.");
    }
  }

  function download() {
    const blob = new Blob([exportLog()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `player-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-hairline bg-background">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-4"
      >
        <Terminal className="size-4 text-primary" aria-hidden />
        <span>Activity log</span>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-xs font-normal text-muted-foreground">
          {entries.length}
        </span>
        {errorCount > 0 && (
          <span className="rounded-full border border-destructive/50 px-2 py-0.5 text-xs font-normal text-destructive">
            {errorCount} {errorCount === 1 ? "error" : "errors"}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div id={panelId} className="border-t border-hairline">
          <div className="flex flex-wrap items-center gap-1 border-b border-hairline bg-panel px-3 py-2 sm:px-4">
            <div
              role="group"
              aria-label="Filter activity log"
              className="flex flex-wrap gap-1"
            >
              {LEVELS.map((level) => (
                <button
                  key={level.key}
                  type="button"
                  onClick={() => setFilter(level.key)}
                  aria-pressed={filter === level.key}
                  className={cn(
                    "min-h-9 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    filter === level.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-inset hover:text-foreground",
                  )}
                >
                  {level.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <LogAction
                label="Copy activity log"
                onClick={() => void copyAll()}
              >
                <Copy className="size-4" />
              </LogAction>
              <LogAction label="Export activity log" onClick={download}>
                <Download className="size-4" />
              </LogAction>
              <LogAction label="Clear activity log" onClick={clearLog}>
                <Eraser className="size-4" />
              </LogAction>
            </div>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {copyStatus}
          </p>
          <div className="max-h-56 overflow-auto px-3 py-3 font-mono text-xs leading-relaxed sm:max-h-64 sm:px-4">
            {visible.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground">
                Nothing logged at this level yet.
              </p>
            ) : (
              <ol className="flex flex-col-reverse gap-1.5">
                {visible.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid grid-cols-[auto_auto_1fr] gap-x-3"
                  >
                    <time className="text-muted-foreground/70">
                      {new Date(entry.at).toISOString().slice(11, 23)}
                    </time>
                    <span className="w-16 truncate uppercase text-primary">
                      {entry.scope}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 break-words",
                        LEVEL_COLOR[entry.level],
                      )}
                    >
                      {entry.message}
                      {entry.ms !== undefined && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {entry.ms}ms
                        </span>
                      )}
                      {entry.detail && (
                        <span className="block break-all text-muted-foreground">
                          {entry.detail}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function LogAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}
