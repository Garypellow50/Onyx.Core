import { useRef, useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";

export function EmptyStage({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="empty-stage"
      data-dragging={dragging}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!event.dataTransfer.types.includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = 0;
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      <div className="empty-stage-content">
        <span className="aperture" aria-hidden="true">
          <Play className="ml-1 size-6" strokeWidth={1.2} />
        </span>
        <h2>{dragging ? "Drop it. Then press play." : "Make room for the picture."}</h2>
        <p className="empty-stage-copy">
          Drop a film or an audio file here. Your local media stays right where it belongs: with you.
        </p>
        <button type="button" className="primary-action" onClick={() => inputRef.current?.click()}>
          Open files <ArrowUpRight className="size-4" aria-hidden="true" />
        </button>
        <p className="text-[11px] tracking-wide text-muted-foreground">Video · Audio · Captions</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length) onFiles(files);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
