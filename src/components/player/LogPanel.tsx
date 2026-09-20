import { useId, useMemo, useState } from "react";
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
  const [copyStatus, setCopyStatus] = useState("");
  const contentId = useId();

  const visible = useMemo(() => filter === "all" ? entries : entries.filter((entry) => entry.level === filter), [entries, filter]);
  const errorCount = entries.filter((entry) => entry.level === "error").length;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(exportLog());
      setCopyStatus("Log copied to clipboard.");
    } catch {
      setCopyStatus("Could not copy the log to the clipboard.");
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
    <section className="onyx-log min-w-0 rounded-sm border border-hairline bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b border-hairline bg-panel px-3 py-2 sm:px-4">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={contentId} className="label-machined flex min-h-10 items-center gap-2 text-foreground">
          <Terminal className="size-3.5 text-primary" aria-hidden />
          Session activity
          <span className="readout rounded-sm border border-hairline px-1.5 py-0.5 text-[10px] font-normal tracking-normal text-muted-foreground">{entries.length}</span>
          {errorCount > 0 && <span className="readout rounded-sm border border-destructive/60 px-1.5 py-0.5 text-[10px] font-normal tracking-normal text-destructive">{errorCount} err</span>}
          {open ? <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden /> : <ChevronUp className="size-3.5 text-muted-foreground" aria-hidden />}
        </button>

        {open && <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:ml-auto sm:w-auto sm:flex-nowrap">
          {LEVELS.map((level) => <button key={level.key} type="button" onClick={() => setFilter(level.key)} aria-pressed={filter === level.key} className={cn("readout min-h-9 rounded-sm px-2 py-1 text-[10px] uppercase tracking-widest transition-colors", filter === level.key ? "border border-primary text-primary" : "border border-transparent text-muted-foreground hover:text-foreground")}>{level.label}</button>)}
          <span className="mx-1 hidden h-3 w-px bg-hairline sm:block" aria-hidden />
          <Button variant="ghost" size="icon" className="size-10" onClick={copyAll} title="Copy log" aria-label="Copy log"><Copy className="size-3.5" aria-hidden /></Button>
          <Button variant="ghost" size="icon" className="size-10" onClick={download} title="Export log" aria-label="Export log"><Download className="size-3.5" aria-hidden /></Button>
          <Button variant="ghost" size="icon" className="size-10" onClick={clearLog} title="Clear log" aria-label="Clear log"><Eraser className="size-3.5" aria-hidden /></Button>
        </div>}
      </header>

      <p role="status" aria-live="polite" className="sr-only">{copyStatus}</p>
      {open && <div id={contentId} className="readout max-h-56 overflow-auto px-3 py-3 text-[10px] leading-relaxed sm:max-h-64 sm:px-4 sm:text-[11px]">
        {visible.length === 0 ? <p className="text-muted-foreground">Nothing logged at this level yet.</p> : <ol className="flex flex-col-reverse gap-1">{visible.map((entry) => <li key={entry.id} className="flex gap-3"><span className="shrink-0 text-muted-foreground/70">{new Date(entry.at).toISOString().slice(11, 23)}</span><span className="w-12 shrink-0 truncate uppercase text-primary sm:w-16">{entry.scope}</span><span className={cn("min-w-0 break-words", LEVEL_COLOR[entry.level])}>{entry.message}{entry.ms !== undefined && <span className="text-muted-foreground"> · {entry.ms}ms</span>}{entry.detail && <span className="block break-all text-muted-foreground">{entry.detail}</span>}</span></li>)}</ol>}
      </div>}
    </section>
  );
}
