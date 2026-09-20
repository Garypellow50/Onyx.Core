import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Space / K", action: "Play or pause" },
  { keys: "J / L", action: "Skip back / forward 10 seconds" },
  { keys: "← / →", action: "Skip back / forward 5 seconds" },
  { keys: "Shift + ← / →", action: "Step one frame" },
  { keys: "↑ / ↓", action: "Volume up / down" },
  { keys: "0 – 9", action: "Jump to 0% – 90% of the file" },
  { keys: "F", action: "Fullscreen" },
  { keys: "M", action: "Mute" },
  { keys: "C", action: "Cycle subtitles / CC" },
  { keys: "A", action: "Cycle audio track" },
  { keys: "R", action: "Rotate 90°" },
  { keys: "< / >", action: "Slower / faster playback" },
  { keys: "P", action: "Picture-in-picture" },
  { keys: "S", action: "Toggle stats overlay" },
  { keys: "N / B", action: "Next / previous file in playlist" },
  { keys: "?", action: "Show this list" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-3xl border-border bg-card p-5 sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 sm:gap-x-6">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="flex min-h-11 items-center justify-between gap-3 border-b border-border/70 py-2 text-sm">
              <span className="text-muted-foreground">{shortcut.action}</span>
              <kbd className="shrink-0 rounded-lg border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground shadow-sm">
                {shortcut.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
