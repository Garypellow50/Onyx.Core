import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Download, Eraser, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.level === filter)),
    [entries, filter],
  );
  const errorCount = entries.filter((entry) => entry.level === "error").length;
  const panelId = "engineering-log-content";

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(exportLog());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
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
    <section className="cinema-log min-w-0 overflow-hidden rounded-2xl border border-hairline bg-background">
      <header className={cn("flex items-center gap-2 bg-panel px-3 py-2.5 sm:px-4", open && "border-b border-hairline")}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 text-left text-[13px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Terminal className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">Engineering log</span>
          <span className="rounded-lg border border-hairline px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {entries.length}
          </span>
          {errorCount > 0 && (
            <span className="rounded-lg border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-xs font-normal text-destructive">
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </span>
          )}
          {open ? (
            <ChevronUp className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </header>

      {open && (
        <div id={panelId}>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-2 sm:px-4">
            <div className="flex flex-wrap items-center gap-1" aria-label="Filter log entries">
              {LEVELS.map((level) => (
                <button
                  key={level.key}
                  type="button"
                  onClick={() => setFilter(level.key)}
                  aria-pressed={filter === level.key}
                  className={cn(
                    "min-h-9 rounded-lg border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              <Button variant="ghost" size="icon" className="size-9 rounded-lg" onClick={copyAll} aria-label="Copy log" title="Copy log">
                <Copy className="size-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" className="size-9 rounded-lg" onClick={download} aria-label="Export log" title="Export log">
                <Download className="size-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" className="size-9 rounded-lg" onClick={clearLog} aria-label="Clear log" title="Clear log">
                <Eraser className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <p className={cn("px-4 pt-2 text-[13px]", copyStatus === "failed" ? "text-destructive" : "text-muted-foreground")} role="status" aria-live="polite">
            {copyStatus === "copied" ? "Log copied." : copyStatus === "failed" ? "Could not copy the log. Use Export log instead." : ""}
          </p>

          <div className="max-h-64 overflow-auto px-3 pb-3 pt-2 font-mono text-xs leading-5 sm:px-4">
            {visible.length === 0 ? (
              <p className="font-sans text-[13px] text-muted-foreground">Nothing logged at this level yet.</p>
            ) : (
              <ol className="flex flex-col-reverse gap-1.5">
                {visible.map((entry) => (
                  <li key={entry.id} className="grid grid-cols-[5.5rem_4rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1 hover:bg-inset">
                    <span className="text-muted-foreground/80">{new Date(entry.at).toISOString().slice(11, 23)}</span>
                    <span className="truncate uppercase text-primary">{entry.scope}</span>
                    <span className={cn("min-w-0 break-words", LEVEL_COLOR[entry.level])}>
                      {entry.message}
                      {entry.ms !== undefined && <span className="text-muted-foreground"> · {entry.ms}ms</span>}
                      {entry.detail && <span className="block whitespace-pre-wrap break-all text-muted-foreground">{entry.detail}</span>}
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
