import { describe, expect, it } from "vitest";

describe("native host shebang normalization", () => {
  it("keeps exactly one node shebang at the start of the bundle", async () => {
    const { normalizeNodeShebang } = await import("../scripts/native-host-shebang.mjs");
    const source = "#!/usr/bin/env node\n#!/usr/bin/env node\n\nconsole.log('ok');\n";
    const normalized = normalizeNodeShebang(source);

    expect(normalized.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(normalized.match(/#!\/usr\/bin\/env node/g)).toHaveLength(1);
    expect(normalized).toContain("console.log('ok');");
  });
});
