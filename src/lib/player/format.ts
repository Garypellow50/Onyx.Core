export function formatTime(seconds: number, forceHours = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) return forceHours ? "0:00:00" : "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0 || forceHours) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(2) : Math.round(value)} ${units[unit]}`;
}

export function formatBitrate(bitsPerSecond: number): string {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return "—";
  if (bitsPerSecond > 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
  return `${Math.round(bitsPerSecond / 1000)} kbps`;
}
