import { useEffect, useRef, useState } from "react";

/**
 * Tiny localStorage-backed state used for player UI preferences that must
 * survive a screen rotation, a device resize, or a reload — panel
 * minimisation, the chosen audio track, volume, rotation, caption geometry
 * and the last playback position.
 *
 * Reads happen in an effect (never in the initialiser) so server rendering
 * and hydration agree on the first paint.
 */
const PREFIX = "mp:ui:";

export function readPersisted<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePersisted(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — preferences are best effort */
  }
}

export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = false;
    const stored = readPersisted<T | undefined>(key, undefined);
    if (stored !== undefined) setValue(stored);
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    writePersisted(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}