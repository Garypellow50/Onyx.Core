import { createFileRoute } from "@tanstack/react-router";

/**
 * Range-aware media relay. Browsers cannot read Google Drive / OneDrive share
 * URLs directly (those hosts send no CORS headers), so the fetch happens
 * server-side and the bytes stream back to the page with permissive CORS.
 */

const BLOCKED_HOST =
  /^(localhost$|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

const FORWARD_REQUEST_HEADERS = ["range", "if-range"];
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "content-disposition",
  "last-modified",
  "etag",
];

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  ts: "video/mp2t",
  m2ts: "video/mp2t",
  mts: "video/mp2t",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  ogv: "video/ogg",
  "3gp": "video/3gpp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wma: "audio/x-ms-wma",
};

/** Types that carry no format information, so the media element rejects them. */
const OPAQUE_TYPE = /^(application\/(octet-stream|binary|download|force-download|x-download)|binary\/octet-stream|text\/plain)/i;

function extensionOf(value: string): string {
  const clean = (value.split(/[?#]/)[0] ?? value).toLowerCase();
  const parts = clean.split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

function nameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  return header.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

/**
 * Picks the media type to advertise: the upstream one when it is meaningful,
 * otherwise one derived from the file name (hint param → Content-Disposition →
 * URL path).
 */
function mediaContentType(
  upstreamType: string | null,
  hintedName: string | null,
  disposition: string | null,
  target: URL,
): string | null {
  if (upstreamType && !OPAQUE_TYPE.test(upstreamType)) return null;
  const candidates = [
    hintedName,
    nameFromDisposition(disposition),
    target.pathname.split("/").filter(Boolean).pop() ?? null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const mapped = MIME_BY_EXTENSION[extensionOf(candidate)];
    if (mapped) return mapped;
  }
  return null;
}

function cors(headers: Headers) {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-expose-headers", FORWARD_RESPONSE_HEADERS.join(", "));
  headers.set("access-control-allow-headers", "range, if-range");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  return headers;
}

function resolveTarget(raw: string | null): URL | Response {
  if (!raw) {
    return new Response("Missing url parameter", { status: 400, headers: cors(new Headers()) });
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Malformed url parameter", { status: 400, headers: cors(new Headers()) });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response("Only http and https URLs are supported", {
      status: 400,
      headers: cors(new Headers()),
    });
  }
  if (BLOCKED_HOST.test(target.hostname)) {
    return new Response("That host is not reachable through the relay", {
      status: 403,
      headers: cors(new Headers()),
    });
  }
  return target;
}

async function relay(request: Request, method: "GET" | "HEAD"): Promise<Response> {
  const requestUrl = new URL(request.url);
  const target = resolveTarget(requestUrl.searchParams.get("url"));
  if (target instanceof Response) return target;
  const hintedName = requestUrl.searchParams.get("name");

  const forwarded = new Headers();
  let injectedRange = false;
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) forwarded.set(name, value);
  }
  // Drive's download endpoint serves an interstitial page unless it sees a browser UA.
  forwarded.set(
    "user-agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  );
  forwarded.set("accept", "*/*");

  /**
   * Google Drive answers a plain GET — and even an open-ended `bytes=0-` — with
   * an HTML confirmation page; only a fully bounded range yields media bytes.
   * The media element's first request carries no Range header, so learn the
   * file size with a 2-byte probe and ask for the whole span explicitly.
   */
  if (!forwarded.has("range")) {
    try {
      const probeHeaders = new Headers(forwarded);
      probeHeaders.set("range", "bytes=0-1");
      const probe = await fetch(target.toString(), {
        method: "GET",
        headers: probeHeaders,
        redirect: "follow",
      });
      const total = probe.headers.get("content-range")?.split("/")[1];
      probe.body?.cancel();
      if (probe.status === 206 && total && /^\d+$/.test(total) && Number(total) > 0) {
        forwarded.set("range", `bytes=0-${Number(total) - 1}`);
        injectedRange = true;
      }
    } catch {
      // Probe is best-effort; fall through to the plain request.
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { method, headers: forwarded, redirect: "follow" });
  } catch (error) {
    return new Response(
      `Could not reach that host: ${error instanceof Error ? error.message : String(error)}`,
      { status: 502, headers: cors(new Headers()) },
    );
  }

  const headers = cors(new Headers());

  // Never hand an upstream error page to the media element — that surfaces as an
  // opaque 500 / blank screen. Explain what the host actually said instead.
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    const isDrive = /(^|\.)google\.com$/i.test(target.hostname);
    const hint = isDrive
      ? " Google Drive returns this when the link is a folder (paste it as a folder link instead), when the file is not shared with “Anyone with the link”, or when its download quota is exhausted."
      : "";
    return new Response(
      `That host refused the download (HTTP ${upstream.status}).${hint}`,
      { status: 502, headers: cors(new Headers({ "content-type": "text/plain; charset=utf-8" })) },
    );
  }

  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  // A share/interstitial HTML page is not media bytes.
  if ((headers.get("content-type") ?? "").includes("text/html")) {
    // Drive uses a 200 HTML page for real failures — tell the user which one.
    let page = "";
    try {
      page = (await upstream.text()).slice(0, 20000);
    } catch {
      page = "";
    }
    if (/Quota exceeded|Too many users have viewed or downloaded/i.test(page)) {
      return new Response(
        "Google Drive is rate-limiting this file: “Too many users have viewed or downloaded this file recently.” The link is fine, but Drive will not serve the bytes until the quota resets (can take up to 24 hours). Workarounds: make a copy of the file into your own Drive and share that copy, or download it once and open it locally.",
        { status: 429, headers: cors(new Headers({ "content-type": "text/plain; charset=utf-8" })) },
      );
    }
    if (/Sign in|accounts\.google\.com/i.test(page) && /(^|\.)google\.com$/i.test(target.hostname)) {
      return new Response(
        "Google Drive asked for a sign-in, so this file is not shared publicly. Set sharing to “Anyone with the link” and try again.",
        { status: 403, headers: cors(new Headers({ "content-type": "text/plain; charset=utf-8" })) },
      );
    }
    return new Response(
      "That link returned a web page, not media bytes. It is probably a share/confirmation page or a folder — use a folder link or pick the file locally.",
      { status: 415, headers: cors(new Headers({ "content-type": "text/plain; charset=utf-8" })) },
    );
  }

  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "no-store");

  // The caller asked for the whole file, so present the injected range response
  // as an ordinary 200 with a plain Content-Length.
  let status = upstream.status;
  if (injectedRange && upstream.status === 206) {
    const total = headers.get("content-range")?.split("/")[1];
    headers.delete("content-range");
    if (total && /^\d+$/.test(total)) headers.set("content-length", total);
    status = 200;
  }

  // Drive/OneDrive label everything application/octet-stream; <video> treats that
  // as an unplayable source even when the bytes are a perfectly good MP4.
  const corrected = mediaContentType(
    headers.get("content-type"),
    hintedName,
    headers.get("content-disposition"),
    target,
  );
  if (corrected) headers.set("content-type", corrected);

  return new Response(method === "HEAD" ? null : upstream.body, {
    status,
    statusText: upstream.statusText,
    headers,
  });
}

export const Route = createFileRoute("/api/public/stream")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: cors(new Headers()) }),
      HEAD: ({ request }) => relay(request, "HEAD"),
      GET: ({ request }) => relay(request, "GET"),
    },
  },
});
