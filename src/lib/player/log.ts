import { useSyncExternalStore } from "react";

export type LogLevel = "debug" | "info" | "success" | "warn" | "error";

export interface LogEntry {
  id: number;
  at: number;
  level: LogLevel;
  scope: string;
  message: string;
  detail?: string | undefined;
  ms?: number | undefined;
}

const MAX_ENTRIES = 3000;

let entries: LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function stringifyDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail instanceof Error) return `${detail.name}: ${detail.message}`;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function logEvent(
  level: LogLevel,
  scope: string,
  message: string,
  detail?: unknown,
): LogEntry {
  const entry: LogEntry = {
    id: nextId++,
    at: Date.now(),
    level,
    scope,
    message,
    detail: detail === undefined ? undefined : stringifyDetail(detail),
  };
  entries = entries.concat(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  emit();
  return entry;
}

export const log = {
  debug: (scope: string, message: string, detail?: unknown) =>
    logEvent("debug", scope, message, detail),
  info: (scope: string, message: string, detail?: unknown) =>
    logEvent("info", scope, message, detail),
  ok: (scope: string, message: string, detail?: unknown) =>
    logEvent("success", scope, message, detail),
  warn: (scope: string, message: string, detail?: unknown) =>
    logEvent("warn", scope, message, detail),
  error: (scope: string, message: string, detail?: unknown) =>
    logEvent("error", scope, message, detail),
};

/** Times an async step and logs start + completion with duration. */
export async function logStep<T>(
  scope: string,
  message: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const started = performance.now();
  log.info(scope, `${message}…`);
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - started);
    const entry = log.ok(scope, `${message} — done`);
    entry.ms = ms;
    emit();
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    const entry = log.error(scope, `${message} — failed`, err);
    entry.ms = ms;
    emit();
    throw err;
  }
}

export function clearLog() {
  entries = [];
  emit();
}

export function exportLog(): string {
  return entries
    .map((e) => {
      const time = new Date(e.at).toISOString().slice(11, 23);
      const dur = e.ms === undefined ? "" : ` (${e.ms}ms)`;
      const detail = e.detail ? `\n    ${e.detail.replace(/\n/g, "\n    ")}` : "";
      return `[${time}] ${e.level.toUpperCase().padEnd(7)} ${e.scope.padEnd(12)} ${e.message}${dur}${detail}`;
    })
    .join("\n");
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const EMPTY: LogEntry[] = [];

export function useLog(): LogEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => entries,
    () => EMPTY,
  );
}
