import { log } from "./log";
import { formatBytes } from "./format";
import { itemFromUrl, type MediaItem } from "./media";
import { normalizeLink, relayUrl } from "./link";

export interface RemoteProbe {
  ok: boolean;
  item?: MediaItem | undefined;
  status?: number | undefined;
  size?: number | undefined;
  acceptsRanges: boolean;
  contentType?: string | undefined;
  error?: string | undefined;
  viaRelay?: boolean | undefined;
}

function fileNameFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const fromPath = url.pathname.split("/").filter(Boolean).pop();
    const fromQuery =
      url.searchParams.get("filename") ??
      url.searchParams.get("name") ??
      url.searchParams.get("title");
    return decodeURIComponent(fromQuery ?? fromPath ?? "remote-media");
  } catch {
    return "remote-media";
  }
}

/**
 * Content-Disposition is latin1 on the wire while hosts really send UTF-8, and
 * relaying the header can stack that mis-decode twice — so unwrap until stable.
 */
function decodeLatin1AsUtf8(value: string): string {
  let result = value;
  for (let pass = 0; pass < 3; pass++) {
    if (!/[\u0080-\u00ff]/.test(result)) break;
    try {
      const bytes = Uint8Array.from(result, (char) => char.charCodeAt(0) & 0xff);
      result = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      break;
    }
  }
  return result;
}

function nameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) return decodeURIComponent(star[1]);
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain?.[1] ? decodeLatin1AsUtf8(plain[1]) : null;
}

interface AttemptResult extends RemoteProbe {
  /** Set when the attempt failed in a way a relay retry could fix. */
  retryable?: boolean;
}

async function attempt(
  url: string,
  playbackUrl: string,
  viaRelay: boolean,
): Promise<AttemptResult> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-1" }, mode: "cors" });
    const contentType = res.headers.get("content-type") ?? undefined;
    const contentRange = res.headers.get("content-range");
    const acceptRanges = res.headers.get("accept-ranges");
    const acceptsRanges = res.status === 206 || acceptRanges === "bytes";
    const totalFromRange = contentRange?.split("/")[1];
    const size = totalFromRange
      ? Number(totalFromRange)
      : res.headers.get("content-length")
        ? Number(res.headers.get("content-length"))
        : undefined;

    log.debug(
      "source",
      `HTTP ${res.status} · type ${contentType ?? "unknown"} · ranges ${acceptsRanges ? "yes" : "no"} · ${formatBytes(size)}`,
    );

    if (!res.ok && res.status !== 206) {
      // The relay answers with a plain-language explanation — prefer it.
      let relayMessage = "";
      if (viaRelay && /^text\/plain/i.test(contentType ?? "")) {
        try {
          relayMessage = (await res.text()).trim().slice(0, 600);
        } catch {
          relayMessage = "";
        }
      }
      return {
        ok: false,
        retryable: !viaRelay && res.status !== 429,
        status: res.status,
        acceptsRanges,
        error:
          relayMessage ||
          `The host answered HTTP ${res.status}. The link may have expired, or the file is not shared publicly — set sharing to “Anyone with the link”.`,
      };
    }

    if (contentType && /^text\/html/i.test(contentType)) {
      return {
        ok: false,
        retryable: !viaRelay,
        status: res.status,
        acceptsRanges,
        contentType,
        error:
          "That host returned a web page instead of media bytes. For Google Drive this normally means the file is not shared with “Anyone with the link”, or it is too large for Drive's virus scan bypass. Sharing it publicly, or picking the file locally, both work.",
      };
    }

    const name =
      nameFromDisposition(res.headers.get("content-disposition")) ?? fileNameFromUrl(playbackUrl);
    const item = itemFromUrl(playbackUrl, name, size);

    if (!acceptsRanges) {
      log.warn(
        "source",
        "Server does not advertise byte ranges — seeking may force a full download",
      );
    }

    return { ok: true, item, status: res.status, size, acceptsRanges, contentType, viaRelay };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("source", "Direct cross-origin read blocked", message);
    return {
      ok: false,
      retryable: !viaRelay,
      acceptsRanges: false,
      error:
        "Even through the relay, that URL could not be read. Check that the link is public and still valid, or pick the file locally instead.",
    };
  }
}

/**
 * Verifies a link is playable: share URLs are rewritten to their true download
 * endpoint, and anything the browser cannot read cross-origin is retried
 * through the app's own range-aware relay.
 */
export async function probeRemoteUrl(rawUrl: string): Promise<RemoteProbe> {
  const raw = rawUrl.trim();
  if (!/^https?:\/\//i.test(raw)) {
    return { ok: false, acceptsRanges: false, error: "URL must start with http:// or https://" };
  }

  const { direct, provider, needsRelay } = normalizeLink(raw);
  if (direct !== raw) {
    log.info("source", `Rewrote ${provider} to its direct download endpoint`, direct);
  }

  if (!needsRelay) {
    log.info("source", "Probing the host directly with a 2-byte range request", direct);
    const first = await attempt(direct, direct, false);
    if (first.ok || !first.retryable) return first;
    log.info("source", "Falling back to the built-in streaming relay");
  } else {
    log.info("source", `${provider} blocks browser reads — streaming through the relay`);
  }

  const relay = relayUrl(direct);
  return attempt(relay, relay, true);
}
