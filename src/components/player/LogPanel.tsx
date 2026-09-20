import { useId, useMemo, useState } from "react";
import { ChevronDown, Copy, Download, Eraser } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearLog, exportLog, useLog, type LogLevel } from "@/lib/player/log";

const LEVELS: { key: LogLevel | "all"; label: string }[] = [
  { key: "all", label: "All entries" },
  { key: "debug", label: "Debug" },
  { key: "info", label: "Information" },
  { key: "success", label: "Success" },
  { key: "warn", label: "Warnings" },
  { key: "error", label: "Errors" },
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
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.level === filter)),
    [entries, filter],
  );
  const errorCount = entries.filter((entry) => entry.level === "error").length;

  async function copyAll() {
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(exportLog());
      setCopyStatus("Log copied.");
    } catch {
      setCopyStatus("Could not copy the log. You can export it instead.");
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
    <section
      className="diagnostics min-w-0 rounded-2xl border border-border bg-card text-card-foreground"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <header className="p-2 sm:px-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-10 w-full min-w-0 flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span>Activity log</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {entries.length}<span className="sr-only"> entries</span>
          </span>
          {errorCount > 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-normal tabular-nums text-destructive">
              {errorCount} {errorCount === 1 ? "error" : "errors"}
            </span>
          )}
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground", open && "rotate-180")} aria-hidden />
        </button>
      </header>

      <div id={panelId} hidden={!open} className="min-w-0 border-t border-border">
        <div className="flex min-w-0 flex-wrap items-center gap-3 p-3 sm:p-4">
          <div className="flex min-w-0 flex-wrap gap-1" role="group" aria-label="Filter activity log">
            {LEVELS.map((level) => (
              <button
                key={level.key}
                type="button"
                onClick={() => setFilter(level.key)}
                aria-pressed={filter === level.key}
                className={cn(
                  "min-h-10 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === level.key
                    ? "border-border bg-muted text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {level.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1" role="group" aria-label="Activity log actions">
            <Button variant="ghost" size="icon" className="size-10 rounded-lg" onClick={() => void copyAll()} aria-label="Copy activity log" title="Copy log">
              <Copy className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="size-10 rounded-lg" onClick={download} aria-label="Export activity log" title="Export log">
              <Download className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="size-10 rounded-lg" onClick={clearLog} aria-label="Clear activity log" title="Clear log">
              <Eraser className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <p
          role="status"
          aria-atomic="true"
          className={cn(
            "px-4 text-xs [overflow-wrap:anywhere]",
            copyStatus && "pb-3",
            copyStatus?.startsWith("Could not") ? "text-destructive" : "text-chart-2",
          )}
        >
          {copyStatus}
        </p>
        <div className="max-h-64 min-w-0 overflow-auto rounded-b-2xl border-t border-border bg-background/40 px-3 py-3 font-mono text-xs leading-relaxed sm:px-4">
          {visible.length === 0 ? (
            <p className="text-muted-foreground">No entries match this filter.</p>
          ) : (
            <ol className="flex flex-col-reverse gap-2">
              {visible.map((entry) => (
                <li key={entry.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg py-1 sm:grid-cols-[auto_4rem_minmax(0,1fr)]">
                  <span className="tabular-nums text-muted-foreground">{new Date(entry.at).toISOString().slice(11, 23)}</span>
                  <span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{entry.scope}</span>
                  <span className={cn("col-span-2 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] sm:col-span-1", LEVEL_COLOR[entry.level])}>
                    <span className="sr-only">{entry.level}: </span>
                    {entry.message}
                    {entry.ms !== undefined && <span className="text-muted-foreground"> · {entry.ms}ms</span>}
                    {entry.detail && <span className="block text-muted-foreground">{entry.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
