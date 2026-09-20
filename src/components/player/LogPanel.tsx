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

const PANEL_ID = "diagnostics-panel-content";

export function LogPanel() {
  const entries = useLog();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [feedback, setFeedback] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.level === filter)),
    [entries, filter],
  );

  const errorCount = entries.filter((e) => e.level === "error").length;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(exportLog());
      setFeedback("Log copied to clipboard.");
    } catch {
      setFeedback("Copy failed. Your browser blocked clipboard access.");
    }
  }

  function download() {
    const blob = new Blob([exportLog()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `player-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="diagnostics-panel min-w-0 rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={PANEL_ID}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Terminal className="size-4 text-muted-foreground" aria-hidden />
          Diagnostics
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
            {entries.length}
          </span>
          {errorCount > 0 && (
            <span className="rounded-md border border-destructive/50 px-1.5 py-0.5 text-[11px] font-normal text-destructive">
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </span>
          )}
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          )}
        </button>

        {open && (
          <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:ml-auto sm:w-auto">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setFilter(l.key)}
                className={cn(
                  "rounded-lg px-2 py-1 text-[11px] transition-colors",
                  filter === l.key
                    ? "border border-primary text-primary"
                    : "border border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
              </button>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-[11px]"
              onClick={() => void copyAll()}
            >
              <Copy className="size-3.5" aria-hidden />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-[11px]"
              onClick={download}
            >
              <Download className="size-3.5" aria-hidden />
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-[11px]"
              onClick={() => {
                clearLog();
                setFeedback("Log cleared.");
              }}
            >
              <Eraser className="size-3.5" aria-hidden />
              Clear
            </Button>
          </div>
        )}
      </header>

      {open && (
        <div id={PANEL_ID}>
          <p role="status" aria-live="polite" className={cn("px-4", !feedback && "sr-only")}>
            {feedback ? (
              <span className="block border-b border-border py-2 text-xs text-muted-foreground">
                {feedback}
              </span>
            ) : null}
          </p>
          <div className="max-h-56 overflow-auto px-4 py-3 text-[11px] leading-relaxed sm:max-h-64 sm:text-xs">
            {visible.length === 0 ? (
              <p className="text-muted-foreground">Nothing logged at this level yet.</p>
            ) : (
              <ol className="flex flex-col-reverse gap-1">
                {visible.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="shrink-0 tabular-nums text-muted-foreground/70">
                      {new Date(e.at).toISOString().slice(11, 23)}
                    </span>
                    <span className="w-12 shrink-0 truncate text-muted-foreground sm:w-16">
                      {e.scope}
                    </span>
                    <span className={cn("min-w-0 break-words", LEVEL_COLOR[e.level])}>
                      {e.message}
                      {e.ms !== undefined && (
                        <span className="text-muted-foreground"> \u00b7 {e.ms}ms</span>
                      )}
                      {e.detail && (
                        <span className="block break-all text-muted-foreground">{e.detail}</span>
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
