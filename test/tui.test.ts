import { describe, expect, mock, test } from "bun:test";
import type { Plugin } from "@opencode/plugin/tui";
import serverPlugin from "../src/index";
import plugin, { resolveTreeProjectRoot } from "../src/tui";

describe("OpenCode V2 TUI plugin", () => {
  test("exports a no-op server entrypoint so OpenCode loads the TUI export", () => {
    expect(serverPlugin.id).toBe("opencode.tree.server");
    expect(serverPlugin.setup({} as never)).toBeUndefined();
  });

  test("exports a V2 plugin definition", () => {
    expect(plugin.id).toBe("opencode.tree");
    expect(typeof plugin.setup).toBe("function");
  });

  test("registers the tree command and route through the V2 context", () => {
    const cleanupRoute = mock(() => {});
    const cleanupCommands = mock(() => {});
    const register = mock(() => cleanupRoute);
    const slot = mock((_input: Parameters<Plugin.Context["ui"]["slot"]>[0]) => cleanupCommands);
    const layer = mock((_input: () => { commands?: readonly unknown[] }) => {});
    const context = {
      options: {},
      keymap: { layer },
      ui: {
        slot,
        router: {
          current: () => ({ type: "home" as const }),
          register,
        },
      },
    } as unknown as Plugin.Context;

    const cleanup = plugin.setup(context) as () => void;
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: "tree" }));
    expect(slot).toHaveBeenCalledWith(expect.objectContaining({ append: "app" }));
    expect(layer).not.toHaveBeenCalled();

    const render = slot.mock.calls[0]?.[0].render;
    expect(render?.({} as never)).toBeNull();
    expect(layer).toHaveBeenCalledTimes(1);

    const createLayer = layer.mock.calls[0]?.[0];
    expect(createLayer?.().commands).toEqual([
      expect.objectContaining({
        id: "tree.open",
        palette: true,
        slash: { name: "tree" },
      }),
    ]);

    cleanup();
    expect(cleanupCommands).toHaveBeenCalledTimes(1);
    expect(cleanupRoute).toHaveBeenCalledTimes(1);
  });

  test("uses the selected session location for tree storage", () => {
    const context = {
      location: { directory: "/plugin-location" },
      data: {
        session: {
          get: () => ({ location: { directory: "/session-location" } }),
        },
        location: { default: () => ({ directory: "/default-location" }) },
      },
    } as unknown as Pick<Plugin.Context, "data" | "location">;

    expect(resolveTreeProjectRoot(context, "sess_1")).toBe("/session-location");
  });
});
