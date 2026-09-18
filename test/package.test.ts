import { describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "../package.json";

describe("package manifest", () => {
  test("does not trigger npm Git dependency preparation", () => {
    const scripts = manifest.scripts as Record<string, string>;
    const preparationScripts = [
      "preinstall",
      "install",
      "postinstall",
      "build",
      "prepack",
      "prepare",
    ];

    expect(scripts.compile).toBe("bun scripts/build.ts");
    for (const name of preparationScripts) {
      expect(scripts[name]).toBeUndefined();
    }
  });

  test("requires the OpenTUI runtime dependencies for Git package installs", () => {
    const metadata = (manifest as { peerDependenciesMeta?: Record<string, { optional?: boolean }> })
      .peerDependenciesMeta;

    expect(manifest.peerDependencies["@opentui/core"]).toBeDefined();
    expect(manifest.peerDependencies["@opentui/solid"]).toBeDefined();
    expect(manifest.peerDependencies["solid-js"]).toBeDefined();
    expect((manifest.dependencies as Record<string, string>)["solid-js"]).toBeUndefined();
    expect(metadata?.["@opentui/core"]?.optional).not.toBe(true);
    expect(metadata?.["@opentui/solid"]?.optional).not.toBe(true);
  });

  test("loads TypeScript entrypoints without committed build output", () => {
    expect(manifest.exports).toEqual({
      ".": "./src/index.ts",
      "./tui": "./src/tui.ts",
    });
    expect(manifest.files).toContain("src");
    expect(manifest.files).toContain("tsconfig.json");
    expect(manifest.files).not.toContain("dist");
  });

  test("keeps TSX reactive when the source package is installed under node_modules", async () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const temporaryRoot = join(tmpdir(), "opencode");
    await mkdir(temporaryRoot, { recursive: true });
    const temporary = await mkdtemp(join(temporaryRoot, "tree-source-package-"));
    const installed = join(temporary, "node_modules/@eli0shin/opencode-tree");
    try {
      await mkdir(installed, { recursive: true });
      await cp(join(root, "src"), join(installed, "src"), { recursive: true });
      await cp(join(root, "package.json"), join(installed, "package.json"));
      await cp(join(root, "tsconfig.json"), join(installed, "tsconfig.json"));
      for (const dependency of [
        "@babel",
        "@opencode",
        "@opentui",
        "babel-preset-solid",
        "solid-js",
        "zod",
      ]) {
        await symlink(
          join(root, "node_modules", dependency),
          join(temporary, "node_modules", dependency),
          "dir",
        );
      }
      const child = Bun.spawn(
        [
          process.execPath,
          "--conditions=browser",
          join(root, "test/fixtures/source-package.ts"),
          installed,
        ],
        { cwd: temporary, stdout: "pipe", stderr: "pipe" },
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
      expect(stdout).toContain(
        "PASS: installed TypeScript entrypoint preserves reactive TSX updates",
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
