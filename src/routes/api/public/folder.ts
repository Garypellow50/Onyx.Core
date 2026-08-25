import { createFileRoute } from "@tanstack/react-router";

/**
 * Lists the contents of a public share *folder* (Google Drive or OneDrive) so
 * the page can queue every media file it finds. Browsers cannot read those
 * hosts cross-origin, so the listing happens server-side.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface FolderEntry {
  name: string;
  url: string;
  size?: number;
  needsRelay: boolean;
  /** "folder" entries can be opened to list their own contents. */
  kind?: "file" | "folder";
  mime?: string;
}

interface FolderListing {
  provider: string;
  folderName?: string;
  entries: FolderEntry[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

/** Turns the \x22 / \u0022 escapes in Drive's inline blob back into text. */
function unescapeBlob(raw: string): string {
  return raw
    .replace(/\\x([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\/g, "\\");
}

function driveFolderId(url: URL): string | null {
  const byPath = url.pathname.match(/\/folders\/([\w-]{10,})/);
  if (byPath?.[1]) return byPath[1];
  // Folder ids are often pasted in the /file/d/<id>/view shape.
  const byFile = url.pathname.match(/\/file\/d\/([\w-]{10,})/);
  if (byFile?.[1]) return byFile[1];
  if (url.pathname.includes("/drive/")) return url.searchParams.get("id");
  return null;
}

async function listDriveFolder(id: string): Promise<FolderListing> {
  // The embedded folder view is the only Drive surface that reliably renders
  // *every* child with a stable id + title, with no JS blob parsing.
  try {
    const embedded = await listDriveEmbedded(id);
    if (embedded.entries.length > 0) return embedded;
  } catch {
    /* fall through to the share-page parser below */
  }
  const res = await fetch(`https://drive.google.com/drive/folders/${id}?hl=en`, {
    headers: { "user-agent": UA, accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      `Google Drive answered HTTP ${res.status}. Make sure the folder is shared with “Anyone with the link”.`,
    );
  }
  const html = await res.text();
  const blobMatch = html.match(/_DRIVE_ivd\s*=\s*'([^']+)'/);
  const blob = blobMatch?.[1] ? unescapeBlob(blobMatch[1]) : html;

  const found = new Map<string, { name: string; size?: number }>();

  // Primary shape: ["id","id",["parentId"],"name","mime", ... ,"size"
  const primary =
    /"([\w-]{20,})","\1",\[[^\]]*\],"((?:[^"\\]|\\.)*?)","([\w.+-]+\/[\w.+-]+)"/g;
  for (let m = primary.exec(blob); m; m = primary.exec(blob)) {
    if (m[1] && m[2]) found.set(m[1], { name: m[2].replace(/\\"/g, '"') });
  }

  // Fallback: pair an id with the nearest following filename that has an extension.
  if (found.size === 0) {
    const loose = /"([\w-]{25,})"[\s\S]{0,400}?"((?:[^"\\]|\\.){1,200}?\.[A-Za-z0-9]{2,5})"/g;
    for (let m = loose.exec(blob); m; m = loose.exec(blob)) {
      if (m[1] && m[2] && !found.has(m[1])) found.set(m[1], { name: m[2] });
    }
  }

  const nameMatch = html.match(/<title>([^<]*)<\/title>/i);
  const listing: FolderListing = {
    provider: "Google Drive folder",
    entries: [...found.entries()].map(([fileId, meta]) => ({
      name: meta.name,
      url: `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
      needsRelay: true,
      kind: "file" as const,
      ...(meta.size === undefined ? {} : { size: meta.size }),
    })),
  };
  const title = nameMatch?.[1]?.replace(/\s*-\s*Google Drive\s*$/i, "").trim();
  if (title) listing.folderName = title;
  return listing;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
}

/** Parses drive.google.com/embeddedfolderview, which lists all children. */
async function listDriveEmbedded(id: string): Promise<FolderListing> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}#list`, {
    headers: { "user-agent": UA, accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      `Google Drive answered HTTP ${res.status}. Make sure the folder is shared with “Anyone with the link”.`,
    );
  }
  const html = await res.text();
  const entries: FolderEntry[] = [];
  const block = /<div class="flip-entry"[^>]*id="entry-([\w-]+)"([\s\S]*?)(?=<div class="flip-entry"|<\/div><\/div><\/div>\s*<script|$)/g;

  for (let m = block.exec(html); m; m = block.exec(html)) {
    const entryId = m[1];
    const body = m[2] ?? "";
    const title = body.match(/class="flip-entry-title">([^<]*)</);
    const icon = body.match(/drive-thirdparty\.googleusercontent\.com\/\d+\/type\/([^"]+)"/);
    if (!entryId || !title?.[1]) continue;
    const mime = icon?.[1] ? decodeEntities(icon[1]) : "";
    const isFolder = mime.includes("folder") || mime.includes("vnd.google-apps");
    entries.push({
      name: decodeEntities(title[1]),
      url: isFolder
        ? `https://drive.google.com/drive/folders/${entryId}`
        : `https://drive.usercontent.google.com/download?id=${entryId}&export=download&confirm=t`,
      needsRelay: !isFolder,
      kind: isFolder ? "folder" : "file",
      ...(mime ? { mime } : {}),
    });
  }

  const listing: FolderListing = { provider: "Google Drive folder", entries };
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const clean = title ? decodeEntities(title).replace(/\s*-\s*Google Drive\s*$/i, "").trim() : "";
  if (clean) listing.folderName = clean;
  return listing;
}

function shareToken(shareUrl: string): string {
  const b64 = Buffer.from(shareUrl, "utf8")
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\//g, "_")
    .replace(/\+/g, "-");
  return `u!${b64}`;
}

interface GraphChild {
  name?: string;
  size?: number;
  folder?: unknown;
  file?: unknown;
  "@content.downloadUrl"?: string;
  "@microsoft.graph.downloadUrl"?: string;
}

async function listOneDriveFolder(shareUrl: string): Promise<FolderListing> {
  const token = shareToken(shareUrl);
  const res = await fetch(
    `https://api.onedrive.com/v1.0/shares/${token}/driveItem?$expand=children`,
    { headers: { "user-agent": UA, accept: "application/json" } },
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "OneDrive would not list that folder anonymously. Personal OneDrive accounts migrated to SharePoint no longer expose folder listings to link-only visitors — share the individual media files (or a Google Drive folder), and single OneDrive file links will stream fine.",
      );
    }
    throw new Error(
      `OneDrive answered HTTP ${res.status}. Make sure the folder link is shared with anyone who has the link.`,
    );
  }
  const body = (await res.json()) as { name?: string; children?: GraphChild[] };
  const entries: FolderEntry[] = [];
  for (const child of body.children ?? []) {
    if (!child.name) continue;
    if (child.folder) {
      entries.push({ name: child.name, url: shareUrl, needsRelay: false, kind: "folder" });
      continue;
    }
    const direct = child["@content.downloadUrl"] ?? child["@microsoft.graph.downloadUrl"];
    if (!direct) continue;
    entries.push({
      name: child.name,
      url: direct,
      needsRelay: true,
      kind: "file",
      ...(typeof child.size === "number" ? { size: child.size } : {}),
    });
  }
  const listing: FolderListing = { provider: "OneDrive folder", entries };
  if (body.name) listing.folderName = body.name;
  return listing;
}

interface OneDriveItem extends GraphChild {
  id?: string;
  parentReference?: { driveId?: string };
  webUrl?: string;
}

interface OneDrivePage {
  value?: OneDriveItem[];
  children?: OneDriveItem[];
  name?: string;
  id?: string;
  parentReference?: { driveId?: string };
  remoteItem?: { id?: string; parentReference?: { driveId?: string } };
  "@odata.nextLink"?: string;
}

function compareOneDriveItems(a: OneDriveItem, b: OneDriveItem) {
  // Match the folder's familiar order: folders first, then natural filename order.
  const byKind = Number(Boolean(a.file)) - Number(Boolean(b.file));
  return byKind || (a.name ?? "").localeCompare(b.name ?? "", undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Graph's expand=children only returns one page and cannot descend into a
 * shared child folder. This walker follows each page and traverses child
 * folders through the resolved drive id, producing one ordered media queue.
 */
async function listOneDriveFolderDeep(shareUrl: string): Promise<FolderListing> {
  const token = shareToken(shareUrl);
  const headers = { "user-agent": UA, accept: "application/json" };
  const api = "https://api.onedrive.com/v1.0";
  const rootResponse = await fetch(`${api}/shares/${token}/driveItem`, { headers });
  if (!rootResponse.ok) {
    if (rootResponse.status === 401 || rootResponse.status === 403) {
      throw new Error("OneDrive denied access to this shared folder. Check that anyone with the link can view the folder.");
    }
    throw new Error(`OneDrive answered HTTP ${rootResponse.status}. Check that the folder link is still valid.`);
  }
  const root = (await rootResponse.json()) as OneDrivePage;
  const driveId = root.remoteItem?.parentReference?.driveId ?? root.parentReference?.driveId;
  const rootId = root.remoteItem?.id ?? root.id;
  if (!driveId || !rootId) throw new Error("OneDrive did not provide enough folder metadata to read this share.");

  const files: FolderEntry[] = [];
  const seenFolders = new Set<string>();
  const seenFiles = new Set<string>();
  const maxDepth = 24;

  async function readPage(url: string): Promise<OneDrivePage> {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`OneDrive answered HTTP ${response.status} while reading the folder.`);
    return (await response.json()) as OneDrivePage;
  }

  async function childrenOf(itemId: string): Promise<OneDriveItem[]> {
    const children: OneDriveItem[] = [];
    let next: string | undefined = `${api}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/children?$top=200`;
    while (next) {
      const page = await readPage(next);
      children.push(...(page.value ?? page.children ?? []));
      next = page["@odata.nextLink"];
    }
    return children.sort(compareOneDriveItems);
  }

  async function walk(itemId: string, path: string[], depth: number): Promise<void> {
    if (depth > maxDepth || seenFolders.has(itemId)) return;
    seenFolders.add(itemId);
    let children: OneDriveItem[];
    try {
      children = await childrenOf(itemId);
    } catch (error) {
      // A single revoked nested folder should not make otherwise accessible
      // media disappear from the queue.
      if (depth === 0) throw error;
      return;
    }
    for (const child of children) {
      if (!child.id || !child.name) continue;
      if (child.folder) {
        await walk(child.id, [...path, child.name], depth + 1);
        continue;
      }
      if (!child.file) continue;
      const direct = child["@content.downloadUrl"] ?? child["@microsoft.graph.downloadUrl"];
      if (!direct || seenFiles.has(child.id)) continue;
      seenFiles.add(child.id);
      files.push({
        // Preserve folder traversal order while keeping duplicate leaf names
        // distinguishable in the queue and the picker.
        name: [...path, child.name].join(" / "),
        url: direct,
        needsRelay: true,
        kind: "file",
        ...(typeof child.size === "number" ? { size: child.size } : {}),
      });
    }
  }

  await walk(rootId, [], 0);
  return {
    provider: "OneDrive folder",
    ...(root.name ? { folderName: root.name } : {}),
    entries: files,
  };
}

async function list(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return json({ error: "Missing url parameter" }, 400);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return json({ error: "Malformed url parameter" }, 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return json({ error: "Only http and https links are supported" }, 400);
  }

  const host = url.hostname.toLowerCase();
  try {
    if (host.endsWith("google.com")) {
      const id = driveFolderId(url);
      if (!id) return json({ error: "That Google Drive link is not a folder link" }, 400);
      return json(await listDriveFolder(id));
    }
    if (host.endsWith("1drv.ms") || host.endsWith("onedrive.live.com") || host.includes("sharepoint.com")) {
      return json(await listOneDriveFolderDeep(url.toString()));
    }
    return json({ error: "Folder listing supports Google Drive and OneDrive share links." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

export const Route = createFileRoute("/api/public/folder")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, { status: 204, headers: { "access-control-allow-origin": "*" } }),
      GET: ({ request }) => list(request),
    },
  },
});
