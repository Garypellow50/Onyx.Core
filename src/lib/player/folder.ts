import { log } from "./log";
import { relayUrl } from "./link";
import { isMediaFileName, itemFromUrl, type MediaItem } from "./media";

export interface FolderResult {
  ok: boolean;
  provider?: string;
  folderName?: string;
  items?: MediaItem[];
  /** Every listed child, media or not, so the picker can show the whole folder. */
  entries?: FolderChild[];
  skipped?: number;
  error?: string;
}

export interface FolderChild {
  name: string;
  url: string;
  size?: number;
  needsRelay: boolean;
  kind: "file" | "folder";
  playable: boolean;
  /** Provider item id used when opening a nested shared folder. */
  folderId?: string;
}

/** True when a share link points at a folder rather than a single file. */
export function isFolderLink(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (host.endsWith("google.com")) {
    return (
      path.includes("/folders/") || path.includes("/drive/u/") || path.endsWith("/drive/my-drive")
    );
  }
  if (host.endsWith("1drv.ms") || host.endsWith("onedrive.live.com") || host.includes("sharepoint.com")) {
    // OneDrive marks folder shares with an /f/ path segment; /v/, /i/, /u/ and
    // /w/ links point at a single file and must go down the media path.
    if (/^\/[viuwbap]\//i.test(path)) return false;
    const sharePointFolder = host.includes("sharepoint.com") && /\/:f:\//i.test(path);
    const legacyOneDriveFolder = host.endsWith("onedrive.live.com") && url.searchParams.has("id") && !/\.[a-z0-9]{2,5}($|\?)/i.test(path);
    return (sharePointFolder || legacyOneDriveFolder || /(^\/f\/|\/f\/c\/|folder)/i.test(url.href)) &&
      !/\.[a-z0-9]{2,5}($|\?)/i.test(path);
  }
  if (host.endsWith("dropbox.com")) {
    return path.includes("/scl/fo/") || path.includes("/sh/");
  }
  return false;
}

interface ListingResponse {
  provider?: string;
  folderName?: string;
  entries?: {
    name: string;
    url: string;
    size?: number;
    needsRelay: boolean;
    kind?: "file" | "folder";
    folderId?: string;
  }[];
  error?: string;
}

/** Turns one listed child into a queueable media item. */
export function itemFromChild(child: FolderChild): MediaItem {
  return itemFromUrl(child.needsRelay ? relayUrl(child.url, child.name) : child.url, child.name, child.size);
}

/** Asks the app's own listing endpoint what is inside a shared folder. */
export async function listFolderLink(raw: string, folderId?: string): Promise<FolderResult> {
  const target = raw.trim();
  log.info("intake", "Reading the shared folder listing", target);

  let body: ListingResponse;
  try {
    const item = folderId ? `&folderId=${encodeURIComponent(folderId)}` : "";
    const res = await fetch(`/api/public/folder?url=${encodeURIComponent(target)}${item}`);
    body = (await res.json()) as ListingResponse;
    if (!res.ok || body.error) {
      log.error("intake", "Folder listing failed", body.error ?? `HTTP ${res.status}`);
      return { ok: false, error: body.error ?? `Folder listing failed with HTTP ${res.status}.` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("intake", "Folder listing failed", message);
    return { ok: false, error: `Could not read that folder: ${message}` };
  }

  const listed = body.entries ?? [];
  const children: FolderChild[] = listed.map((entry) => ({
    name: entry.name,
    url: entry.url,
    needsRelay: entry.needsRelay,
    kind: entry.kind ?? "file",
    playable: (entry.kind ?? "file") === "file" && isMediaFileName(entry.name),
    ...(entry.folderId ? { folderId: entry.folderId } : {}),
    ...(entry.size === undefined ? {} : { size: entry.size }),
  }));
  const media = children.filter((c) => c.playable);
  const skipped = children.length - media.length;

  log.ok(
    "intake",
    `${body.provider ?? "Folder"} listed ${children.length} item(s)`,
    `${media.length} playable · ${skipped} ignored`,
  );

  if (children.length === 0) {
    return {
      ok: false,
      error:
        "That folder listing came back empty — check that the folder is shared with anyone who has the link.",
    };
  }
  if (media.length === 0) {
    return {
      ok: false,
      error: "The shared folder was readable, but it contains no supported audio or video files.",
    };
  }

  const result: FolderResult = { ok: true, items: media.map(itemFromChild), entries: children, skipped };
  if (body.provider) result.provider = body.provider;
  if (body.folderName) result.folderName = body.folderName;
  return result;
}
