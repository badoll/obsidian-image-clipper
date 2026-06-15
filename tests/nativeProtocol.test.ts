import { describe, expect, it } from "vitest";
import { isOriginAllowed } from "../apps/native-host/src/hostSettings";
import { decodeNativeMessageFrames, decodeNativeMessages, encodeNativeMessage } from "../apps/native-host/src/protocol";

describe("native messaging protocol", () => {
  it("round trips length-prefixed JSON messages", () => {
    const message = { type: "ping" };
    expect(decodeNativeMessages(encodeNativeMessage(message))).toEqual([message]);
  });

  it("extracts complete messages without waiting for stdin to close", () => {
    const frame = encodeNativeMessage({ type: "readUserConfig" });
    const partial = frame.subarray(0, frame.length - 1);

    expect(decodeNativeMessageFrames(partial)).toEqual({ messages: [], remaining: partial });
    expect(decodeNativeMessageFrames(frame)).toEqual({
      messages: [{ type: "readUserConfig" }],
      remaining: Buffer.alloc(0),
    });
  });

  it("allows only configured extension origins", async () => {
    const previous = process.env.OIC_ALLOWED_ORIGINS;

    try {
      process.env.OIC_ALLOWED_ORIGINS = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/";
      expect(await isOriginAllowed("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/")).toBe(true);
      expect(await isOriginAllowed("chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/")).toBe(false);
      expect(await isOriginAllowed(undefined)).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.OIC_ALLOWED_ORIGINS;
      } else {
        process.env.OIC_ALLOWED_ORIGINS = previous;
      }
    }
  });
});
