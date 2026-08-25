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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 text-sm">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {s.keys}
              </kbd>
              <span className="text-right text-muted-foreground">{s.action}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
