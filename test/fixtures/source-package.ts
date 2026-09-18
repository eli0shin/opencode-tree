import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Plugin, PluginContextProvider, usePlugin } from "@opencode/plugin/tui";
import { RGBA } from "@opentui/core";
import { testRender } from "@opentui/solid";
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure";
import { createComponent, createSignal } from "solid-js";
import type { TreeRouteBodyState } from "../../src/lib/tree/components/tree-route-content";
import type { TreeTheme } from "../../src/lib/tree/theme";

// Match the host's runtime module sharing before loading a package from node_modules.
ensureRuntimePluginSupport({
  additional: {
    "@opencode/plugin/tui": { Plugin, PluginContextProvider, usePlugin },
  },
});

const directory = process.argv[2];
assert(directory);
assert(directory.includes("node_modules"));
const entry = await import(pathToFileURL(join(directory, "src/tui.ts")).href);
assert.equal(entry.default.id, "opencode.tree");

const { TreeRouteBody } = await import(
  pathToFileURL(join(directory, "src/lib/tree/components/tree-route-content.tsx")).href
);
const { mapTreeTheme } = await import(pathToFileURL(join(directory, "src/lib/tree/theme.ts")).href);
const white = RGBA.fromHex("#ffffff");
const black = RGBA.fromHex("#000000");
const theme: TreeTheme = {
  text: white,
  textSelected: white,
  textMuted: white,
  background: black,
  backgroundElement: black,
  borderSubtle: white,
  borderActive: white,
  primary: white,
  secondary: white,
  accent: white,
  info: white,
  warning: white,
  error: white,
};
const [state, setState] = createSignal<TreeRouteBodyState>({
  kind: "status",
  tone: "loading",
  message: "Loading tree ownership...",
});
const view = await testRender(
  () =>
    createComponent(TreeRouteBody, {
      get state() {
        return state();
      },
      palette: mapTreeTheme(theme),
      theme: () => theme,
      selectedIndex: undefined,
      treeWidth: 80,
      onFocusChange: () => {},
    }),
  { width: 80, height: 10 },
);

try {
  await view.renderOnce();
  assert(view.captureCharFrame().includes("Loading tree ownership..."));
  setState({ kind: "status", tone: "empty", message: "Tree loaded from TypeScript" });
  await view.renderOnce();
  assert(view.captureCharFrame().includes("Tree loaded from TypeScript"));
  assert(!view.captureCharFrame().includes("Loading tree ownership..."));
} finally {
  view.renderer.destroy();
}

console.log("PASS: installed TypeScript entrypoint preserves reactive TSX updates");
