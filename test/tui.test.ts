import { describe, expect, mock, test } from "bun:test";
import type { Plugin } from "@opencode/plugin/tui";
import plugin, { resolveTreeProjectRoot } from "../src/tui";

describe("OpenCode V2 TUI plugin", () => {
  test("exports a V2 plugin definition", () => {
    expect(plugin.id).toBe("opencode.tree");
    expect(typeof plugin.setup).toBe("function");
  });

  test("registers the tree command and route through the V2 context", () => {
    const cleanup = mock(() => {});
    const register = mock(() => cleanup);
    const layer = mock((_input: () => { commands?: readonly unknown[] }) => {});
    const context = {
      options: {},
      keymap: { layer },
      ui: {
        router: {
          current: () => ({ type: "home" as const }),
          register,
        },
      },
    } as unknown as Plugin.Context;

    expect(plugin.setup(context)).toBe(cleanup);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: "tree" }));
    expect(layer).toHaveBeenCalledTimes(1);

    const createLayer = layer.mock.calls[0]?.[0];
    expect(createLayer?.().commands).toEqual([
      expect.objectContaining({
        id: "tree.open",
        palette: true,
        slash: { name: "tree" },
      }),
    ]);
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
