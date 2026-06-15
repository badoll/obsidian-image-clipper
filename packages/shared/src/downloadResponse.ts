export type ResponseLike = {
  status?: number;
  headers?: Record<string, string>;
  arrayBuffer: ArrayBuffer;
};

export type DownloadClassification = {
  ok: boolean;
  status?: number;
  contentType?: string;
  reason?: string;
  loginPageSuspected: boolean;
};

export function classifyDownloadResponse(response: ResponseLike): DownloadClassification {
  const status = response.status;
  const contentType = getHeader(response.headers, "content-type")?.toLowerCase();
  const textSample = decodeSample(response.arrayBuffer).toLowerCase();
  const looksHtml = looksLikeHtml(textSample);
  const loginPageSuspected = looksHtml && /\blogin\b|\bsign[ -]?in\b|\bpassport\b|\bauth\b/.test(textSample);

  if (typeof status === "number" && (status < 200 || status >= 300)) {
    return {
      ok: false,
      status,
      contentType,
      reason: `HTTP ${status}`,
      loginPageSuspected: status === 401 || status === 403 || status === 302 || loginPageSuspected,
    };
  }

  if (contentType?.startsWith("text/html") || looksHtml) {
    return {
      ok: false,
      status,
      contentType,
      reason: "Response looks like HTML instead of a downloadable attachment",
      loginPageSuspected,
    };
  }

  if (
    contentType?.startsWith("text/plain") ||
    contentType?.startsWith("application/json") ||
    (contentType?.includes("xml") && !contentType.includes("svg"))
  ) {
    return {
      ok: false,
      status,
      contentType,
      reason: `Response content-type is ${contentType}`,
      loginPageSuspected,
    };
  }

  return {
    ok: true,
    status,
    contentType,
    loginPageSuspected: false,
  };
}

export function getHeader(headers: Record<string, string> | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  const wanted = key.toLowerCase();
  const found = Object.entries(headers).find(([name]) => name.toLowerCase() === wanted);
  return found?.[1];
}

function decodeSample(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 2048));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function looksLikeHtml(sample: string): boolean {
  const trimmed = sample.trimStart();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html") || trimmed.includes("<body") || trimmed.includes("<title");
}
