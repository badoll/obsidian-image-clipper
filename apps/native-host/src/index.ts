#!/usr/bin/env node
import { decodeNativeMessageFrames, encodeNativeMessage } from "./protocol";
import { writeAuthConfigFile, readAuthConfigMetadata, safeForLog } from "./authFile";
import { isOriginAllowed } from "./hostSettings";
import { readUserConfigFile, writeUserConfigFile } from "./userConfigFile";

type HostRequest =
  | { type: "ping" }
  | { type: "writeAuthConfig"; config: unknown }
  | { type: "readMetadata" }
  | { type: "readUserConfig" }
  | { type: "writeUserConfig"; config: unknown };

async function handleRequest(request: HostRequest, origin: string | undefined): Promise<unknown> {
  const allowed = await isOriginAllowed(origin);
  if (!allowed) {
    throw new Error(`Origin is not allowed: ${origin ?? "<unknown>"}`);
  }

  switch (request.type) {
    case "ping":
      return { ok: true, type: "pong" };
    case "writeAuthConfig":
      return { ok: true, metadata: await writeAuthConfigFile(request.config) };
    case "readMetadata":
      return { ok: true, metadata: await readAuthConfigMetadata() };
    case "readUserConfig":
      return { ok: true, userConfig: await readUserConfigFile() };
    case "writeUserConfig":
      return { ok: true, userConfig: await writeUserConfigFile(request.config) };
    default:
      throw new Error("Unknown native host request");
  }
}

async function main(): Promise<void> {
  const origin = process.argv[2];
  let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let queue = Promise.resolve();

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task, task);
  };

  process.stdin.on("data", (chunk: Buffer) => {
    try {
      const decoded = decodeNativeMessageFrames(Buffer.concat([pending, chunk]));
      pending = decoded.remaining;

      for (const request of decoded.messages) {
        enqueue(() => respondToRequest(request, origin));
      }
    } catch (error) {
      pending = Buffer.alloc(0);
      enqueue(() => respondWithError(error));
    }
  });

  process.stdin.on("end", () => {
    if (pending.length > 0) {
      pending = Buffer.alloc(0);
      enqueue(() => respondWithError(new Error("Native host received an incomplete request")));
    }
  });
}

async function respondToRequest(request: unknown, origin: string | undefined): Promise<void> {
  try {
    if (!request || typeof request !== "object" || !("type" in request)) {
      throw new Error("Native host received an empty or invalid request");
    }

    const response = await handleRequest(request as HostRequest, origin);
    process.stdout.write(encodeNativeMessage(response));
  } catch (error) {
    await respondWithError(error);
  }
}

async function respondWithError(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Native host error", safeForLog({ message }));
  process.stdout.write(encodeNativeMessage({ ok: false, error: message }));
}

void main();
