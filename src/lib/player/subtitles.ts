import { extensionOf } from "./media";

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  src: string;
  cues: number;
  source: "sideload";
}

function timeToVtt(raw: string): string {
  const t = raw.trim().replace(",", ".");
  const parts = t.split(":");
  if (parts.length === 2) return `00:${parts[0]}:${parts[1]}`;
  if (parts.length === 3) {
    const h = (parts[0] ?? "0").padStart(2, "0");
    const m = (parts[1] ?? "0").padStart(2, "0");
    let s = parts[2] ?? "0";
    if (!s.includes(".")) s = `${s}.000`;
    const [sec = "0", frac = "0"] = s.split(".");
    return `${h}:${m}:${sec.padStart(2, "0")}.${frac.padEnd(3, "0").slice(0, 3)}`;
  }
  return "00:00:00.000";
}

function srtToVtt(text: string): { vtt: string; cues: number } {
  const body = text.replace(/\r/g, "").trim();
  const blocks = body.split(/\n{2,}/);
  const out: string[] = ["WEBVTT", ""];
  let cues = 0;
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    const timingIndex = lines.findIndex((l) => l.includes("-->"));
    if (timingIndex === -1) continue;
    const timing = lines[timingIndex] ?? "";
    const [start, end] = timing.split("-->");
    out.push(`${timeToVtt(start ?? "")} --> ${timeToVtt(end ?? "")}`);
    out.push(...lines.slice(timingIndex + 1));
    out.push("");
    cues++;
  }
  return { vtt: out.join("\n"), cues };
}

function assToVtt(text: string): { vtt: string; cues: number } {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = ["WEBVTT", ""];
  let cues = 0;
  let format: string[] = [];
  for (const line of lines) {
    if (line.startsWith("Format:") && format.length === 0) {
      format = line
        .slice(7)
        .split(",")
        .map((s) => s.trim());
      continue;
    }
    if (!line.startsWith("Dialogue:")) continue;
    const values = line.slice(9).split(",");
    const startIdx = format.indexOf("Start");
    const endIdx = format.indexOf("End");
    const textIdx = format.indexOf("Text");
    if (startIdx < 0 || endIdx < 0 || textIdx < 0) continue;
    const start = values[startIdx] ?? "";
    const end = values[endIdx] ?? "";
    const content = values
      .slice(textIdx)
      .join(",")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\N|\\n/g, "\n")
      .trim();
    if (!content) continue;
    out.push(`${timeToVtt(start)} --> ${timeToVtt(end)}`);
    out.push(content);
    out.push("");
    cues++;
  }
  return { vtt: out.join("\n"), cues };
}

function countVttCues(text: string): number {
  return (text.match(/-->/g) ?? []).length;
}

/** Converts any supported subtitle file into a WebVTT blob URL the <track> element can use. */
export async function subtitleFileToTrack(file: File): Promise<SubtitleTrack> {
  const raw = await file.text();
  const ext = extensionOf(file.name);
  let vtt: string;
  let cues: number;
  if (ext === "vtt") {
    vtt = raw.trimStart().startsWith("WEBVTT") ? raw : `WEBVTT\n\n${raw}`;
    cues = countVttCues(vtt);
  } else if (ext === "ass" || ext === "ssa") {
    ({ vtt, cues } = assToVtt(raw));
  } else {
    ({ vtt, cues } = srtToVtt(raw));
  }
  const src = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  return {
    id: `sub-${file.name}-${Date.now()}`,
    label: file.name.replace(/\.[^.]+$/, ""),
    language: guessLanguage(file.name),
    src,
    cues,
    source: "sideload",
  };
}

function guessLanguage(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z]{2,3})\.[a-z]+$/);
  return match?.[1] ?? "und";
}
