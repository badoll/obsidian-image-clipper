import { describe, expect, it } from "vitest";

describe("native host wrapper", () => {
  it("pins node and the native host script to absolute paths", async () => {
    const { renderNativeHostWrapper } = await import("../scripts/native-host-wrapper.mjs");

    const wrapper = renderNativeHostWrapper({
      nodePath: "/opt/homebrew/bin/node",
      scriptPath: "/Users/example/.obsidian-image-clipper/native-host/obsidian-image-clipper-cookie-host.js",
    });

    expect(wrapper).toBe(
      "#!/bin/sh\n" +
        "exec '/opt/homebrew/bin/node' '/Users/example/.obsidian-image-clipper/native-host/obsidian-image-clipper-cookie-host.js' \"$@\"\n",
    );
  });

  it("quotes paths that contain single quotes", async () => {
    const { renderNativeHostWrapper } = await import("../scripts/native-host-wrapper.mjs");

    const wrapper = renderNativeHostWrapper({
      nodePath: "/tmp/node's/bin/node",
      scriptPath: "/tmp/host's/script.js",
    });

    expect(wrapper).toContain("'/tmp/node'\"'\"'s/bin/node'");
    expect(wrapper).toContain("'/tmp/host'\"'\"'s/script.js'");
  });
});
