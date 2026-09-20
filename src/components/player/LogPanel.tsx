import { useId, useMemo, useState } from "react";
import { ChevronDown, Copy, Download, Eraser, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearLog, exportLog, useLog, type LogLevel } from "@/lib/player/log";

const LEVELS: { key: LogLevel | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "debug", label: "Debug" },
  { key: "info", label: "Info" },
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
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const panelId = useId();

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.level === filter)),
    [entries, filter],
  );
  const warningCount = entries.filter((entry) => entry.level === "warn").length;
  const errorCount = entries.filter((entry) => entry.level === "error").length;

  async function copyAll() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(exportLog());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    window.setTimeout(() => setCopyStatus("idle"), 2000);
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
    <section className="diagnostics min-w-0 overflow-hidden rounded-2xl border border-hairline bg-panel/70">
      <header className={cn("flex flex-wrap items-center gap-3 px-4 py-3", open && "border-b border-hairline")}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Terminal className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Diagnostics</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {entries.length} event{entries.length === 1 ? "" : "s"} · {warningCount} warning{warningCount === 1 ? "" : "s"} · {errorCount} error{errorCount === 1 ? "" : "s"}
            </span>
          </span>
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </header>

      {open && (
        <div id={panelId}>
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-3 sm:px-4">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter diagnostics">
              {LEVELS.map((level) => (
                <button
                  key={level.key}
                  type="button"
                  onClick={() => setFilter(level.key)}
                  aria-pressed={filter === level.key}
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filter === level.key
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-inset hover:text-foreground",
                  )}
                >
                  {level.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-11 rounded-xl" onClick={copyAll} title="Copy diagnostics" aria-label="Copy diagnostics">
                <Copy className="size-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" className="size-11 rounded-xl" onClick={download} title="Download diagnostics" aria-label="Download diagnostics">
                <Download className="size-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" className="size-11 rounded-xl" onClick={clearLog} title="Clear diagnostics" aria-label="Clear diagnostics">
                <Eraser className="size-4" aria-hidden />
              </Button>
            </div>
            <p className="w-full text-right text-xs text-muted-foreground" aria-live="polite">
              {copyStatus === "copied" && "Diagnostics copied."}
              {copyStatus === "failed" && "Could not access the clipboard. Download the log instead."}
            </p>
          </div>

          <div className="readout max-h-64 overflow-auto px-4 py-3 text-xs leading-relaxed">
            {visible.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground">Nothing logged at this level yet.</p>
            ) : (
              <ol className="flex flex-col-reverse gap-1.5">
                {visible.map((entry) => (
                  <li key={entry.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 sm:grid-cols-[5.5rem_7rem_minmax(0,1fr)]">
                    <span className="text-muted-foreground/70">{new Date(entry.at).toISOString().slice(11, 23)}</span>
                    <span className="break-words text-primary sm:col-auto">{entry.scope}</span>
                    <span className={cn("col-span-2 min-w-0 break-words sm:col-span-1", LEVEL_COLOR[entry.level])}>
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
