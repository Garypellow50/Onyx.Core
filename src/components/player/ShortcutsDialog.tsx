import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Space / K", action: "Play or pause" },
  { keys: "J / L", action: "Back / forward 10 seconds" },
  { keys: "← / →", action: "Back / forward 5 seconds" },
  { keys: "Shift + ← / →", action: "Step one frame" },
  { keys: "↑ / ↓", action: "Volume up / down" },
  { keys: "0 – 9", action: "Jump to 0% – 90%" },
  { keys: "F", action: "Fullscreen" },
  { keys: "M", action: "Mute" },
  { keys: "C", action: "Cycle captions" },
  { keys: "A", action: "Cycle audio track" },
  { keys: "R", action: "Rotate 90°" },
  { keys: "< / >", action: "Slower / faster playback" },
  { keys: "P", action: "Picture-in-picture" },
  { keys: "S", action: "Toggle playback stats" },
  { keys: "N / B", action: "Next / previous file" },
  { keys: "?", action: "Keyboard shortcuts" },
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
      <DialogContent
        className="max-w-2xl"
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>At your fingertips</DialogTitle>
          <DialogDescription>
            Keyboard shortcuts for your player. When a control has focus, its normal keyboard actions take priority.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid min-w-0 gap-x-6 sm:grid-cols-2" aria-label="Keyboard shortcuts">
          {SHORTCUTS.map(({ keys, action }) => (
            <li key={keys} className="flex min-h-12 min-w-0 items-center justify-between gap-3 border-b border-hairline py-2 text-xs sm:text-sm">
              <span className="min-w-0 text-muted-foreground">{action}</span>
              <kbd className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground">
                {keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
