import { describe, expect, it } from "vitest";
import { classifyDownloadResponse } from "../packages/shared/src/index";

describe("download response classification", () => {
  it("accepts image responses", () => {
    const result = classifyDownloadResponse({
      status: 200,
      headers: { "content-type": "image/png" },
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects html login pages", () => {
    const body = new TextEncoder().encode("<html><title>login</title><body>Sign in</body></html>");
    const result = classifyDownloadResponse({
      status: 200,
      headers: { "content-type": "text/html" },
      arrayBuffer: body.buffer,
    });
    expect(result.ok).toBe(false);
    expect(result.loginPageSuspected).toBe(true);
  });

  it("rejects HTTP errors and structured text responses", () => {
    expect(
      classifyDownloadResponse({
        status: 403,
        headers: { "content-type": "image/png" },
        arrayBuffer: new Uint8Array([1]).buffer,
      }).ok,
    ).toBe(false);

    expect(
      classifyDownloadResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        arrayBuffer: new TextEncoder().encode("{}").buffer,
      }).ok,
    ).toBe(false);

    expect(
      classifyDownloadResponse({
        status: 200,
        headers: { "content-type": "application/xml" },
        arrayBuffer: new TextEncoder().encode("<xml />").buffer,
      }).ok,
    ).toBe(false);
  });

  it("allows SVG and binary attachment-like responses", () => {
    expect(
      classifyDownloadResponse({
        status: 200,
        headers: { "content-type": "image/svg+xml" },
        arrayBuffer: new TextEncoder().encode("<svg />").buffer,
      }).ok,
    ).toBe(true);

    expect(
      classifyDownloadResponse({
        status: 200,
        headers: { "content-type": "application/octet-stream" },
        arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
      }).ok,
    ).toBe(true);
  });
});
