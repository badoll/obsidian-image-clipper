export function encodeNativeMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export function decodeNativeMessages(buffer: Buffer): unknown[] {
  return decodeNativeMessageFrames(buffer).messages;
}

export function decodeNativeMessageFrames(buffer: Buffer): { messages: unknown[]; remaining: Buffer } {
  const messages: unknown[] = [];
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const start = offset + 4;
    const end = start + length;

    if (end > buffer.length) break;

    messages.push(JSON.parse(buffer.subarray(start, end).toString("utf8")));
    offset = end;
  }

  return {
    messages,
    remaining: buffer.subarray(offset),
  };
}
