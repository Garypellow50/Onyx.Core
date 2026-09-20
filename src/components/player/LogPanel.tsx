import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Download, Eraser, Terminal } from "lucide-react";

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

const PANEL_ID = "playback-engineering-log";

export function LogPanel() {
  const entries = useLog();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.level === filter)),
    [entries, filter],
  );

  const errorCount = entries.filter((entry) => entry.level === "error").length;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(exportLog());
      setCopyStatus("Log copied.");
    } catch (error) {
      setCopyStatus(
        error instanceof Error ? `Could not copy the log: ${error.message}` : "Could not copy the log.",
      );
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
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          aria-controls={PANEL_ID}
        >
          <Terminal className="size-4 text-primary" aria-hidden />
          Playback log
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {entries.length}
          </span>
          {errorCount > 0 && (
            <span className="rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-xs font-normal text-destructive">
              {errorCount} {errorCount === 1 ? "error" : "errors"}
            </span>
          )}
          {open ? (
            <ChevronUp className="ml-auto size-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
          )}
        </button>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-11 rounded-xl" onClick={copyAll} aria-label="Copy playback log">
            <Copy className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-11 rounded-xl" onClick={download} aria-label="Export playback log">
            <Download className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-11 rounded-xl" onClick={clearLog} aria-label="Clear playback log">
            <Eraser className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      {copyStatus && (
        <p className={cn("border-t border-border px-4 py-2 text-xs", copyStatus.startsWith("Could not") ? "text-destructive" : "text-muted-foreground")} role="status">
          {copyStatus}
        </p>
      )}

      {open && (
        <div id={PANEL_ID} className="border-t border-border">
          <div className="flex flex-wrap gap-2 p-3 sm:p-4" aria-label="Filter playback log">
            {LEVELS.map((level) => (
              <button
                key={level.key}
                type="button"
                onClick={() => setFilter(level.key)}
                aria-pressed={filter === level.key}
                className={cn(
                  "min-h-11 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === level.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {level.label}
              </button>
            ))}
          </div>

          <div className="readout max-h-64 overflow-auto border-t border-border bg-background px-3 py-3 text-[11px] leading-relaxed sm:px-4">
            {visible.length === 0 ? (
              <p className="text-muted-foreground">No entries match this filter.</p>
            ) : (
              <ol className="flex flex-col-reverse gap-1">
                {visible.map((entry) => (
                  <li key={entry.id} className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                    <span className="text-muted-foreground/70">{new Date(entry.at).toISOString().slice(11, 23)}</span>
                    <span className="w-16 truncate text-primary">{entry.scope}</span>
                    <span className={cn("min-w-0 break-words", LEVEL_COLOR[entry.level])}>
                      {entry.message}
                      {entry.ms !== undefined && <span className="text-muted-foreground"> · {entry.ms}ms</span>}
                      {entry.detail && <span className="block break-all text-muted-foreground">{entry.detail}</span>}
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
