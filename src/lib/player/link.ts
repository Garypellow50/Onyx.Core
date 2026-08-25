/**
 * Turns human share links (Drive, OneDrive, Dropbox) into true byte-serving
 * URLs, and wraps anything a browser cannot read cross-origin in the app's own
 * range-aware relay.
 */

export interface NormalizedLink {
  /** Direct byte URL, before any relay wrapping. */
  direct: string;
  /** Human label for the log, e.g. "Google Drive share link". */
  provider: string;
  /** True when the host is known to refuse cross-origin browser reads. */
  needsRelay: boolean;
}

function driveId(url: URL): string | null {
  const byPath = url.pathname.match(/\/d\/([\w-]{10,})/);
  if (byPath?.[1]) return byPath[1];
  return url.searchParams.get("id");
}

/**
 * Modern personal-OneDrive share links look like
 * `1drv.ms/<kind>/c/<cid>/<shareToken>`. Microsoft migrated those accounts to
 * SharePoint, so the legacy api.onedrive.com/shares endpoint now answers 401 —
 * the personal-content host redeems the token anonymously instead and serves
 * real, range-capable bytes.
 */
export function oneDriveDirect(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host.endsWith("1drv.ms")) {
    const modern = url.pathname.match(/^\/[a-z]\/c\/([0-9a-f]{8,})\/([\w!.~-]{10,})/i);
    if (modern?.[1] && modern[2]) {
      return `https://my.microsoftpersonalcontent.com/personal/${modern[1].toLowerCase()}/_layouts/15/download.aspx?share=${modern[2]}`;
    }
  }
  if (host.includes("microsoftpersonalcontent.com")) return url.toString();
  const share = url.searchParams.get("share");
  const personal = url.pathname.match(/\/personal\/([0-9a-f]{8,})\//i);
  if (share && personal?.[1]) {
    return `https://my.microsoftpersonalcontent.com/personal/${personal[1].toLowerCase()}/_layouts/15/download.aspx?share=${share}`;
  }
  return null;
}

export function normalizeLink(raw: string): NormalizedLink {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { direct: trimmed, provider: "direct link", needsRelay: false };
  }

  const host = url.hostname.toLowerCase();

  if (
    host.endsWith("drive.google.com") ||
    host.endsWith("drive.usercontent.google.com") ||
    host.endsWith("docs.google.com")
  ) {
    const id = driveId(url);
    if (id) {
      return {
        direct: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
        provider: "Google Drive link",
        needsRelay: true,
      };
    }
  }

  if (host.endsWith("dropbox.com")) {
    url.searchParams.set("dl", "1");
    return { direct: url.toString(), provider: "Dropbox link", needsRelay: true };
  }

  if (
    host.endsWith("1drv.ms") ||
    host.includes("sharepoint.com") ||
    host.endsWith("onedrive.live.com")
  ) {
    const direct = oneDriveDirect(url);
    if (direct) {
      return { direct, provider: "OneDrive link", needsRelay: true };
    }
    url.searchParams.set("download", "1");
    return { direct: url.toString(), provider: "OneDrive link", needsRelay: true };
  }

  if (host.includes("microsoftpersonalcontent.com")) {
    return { direct: url.toString(), provider: "OneDrive link", needsRelay: true };
  }

  return { direct: url.toString(), provider: "direct link", needsRelay: false };
}

/**
 * Wraps a URL in the relay. The optional file name travels along so the relay
 * can label the bytes with a real media Content-Type — Drive and OneDrive
 * answer with application/octet-stream, which makes <video> refuse the source.
 */
export function relayUrl(direct: string, name?: string): string {
  const base = `/api/public/stream?url=${encodeURIComponent(direct)}`;
  return name ? `${base}&name=${encodeURIComponent(name)}` : base;
}
