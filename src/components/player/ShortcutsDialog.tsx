import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl border-hairline bg-panel p-6 sm:p-8">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-xl font-medium text-foreground">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Control playback without leaving the player. Shortcuts do not run while you type in a field or adjust the seek control.
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="flex min-h-12 items-center justify-between gap-4 border-b border-hairline/70 py-2 text-sm">
              <span className="leading-snug text-muted-foreground">{shortcut.action}</span>
              <kbd className="shrink-0 rounded-lg border border-hairline bg-inset px-2.5 py-1.5 font-mono text-xs text-foreground shadow-sm">
                {shortcut.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
