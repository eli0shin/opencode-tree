import { describe, expect, test } from "bun:test";
import manifest from "../package.json";

describe("package manifest", () => {
  test("requires the OpenTUI runtime dependencies for Git package installs", () => {
    const metadata = (manifest as { peerDependenciesMeta?: Record<string, { optional?: boolean }> })
      .peerDependenciesMeta;

    expect(manifest.peerDependencies["@opentui/core"]).toBeDefined();
    expect(manifest.peerDependencies["@opentui/solid"]).toBeDefined();
    expect(metadata?.["@opentui/core"]?.optional).not.toBe(true);
    expect(metadata?.["@opentui/solid"]?.optional).not.toBe(true);
  });
});
