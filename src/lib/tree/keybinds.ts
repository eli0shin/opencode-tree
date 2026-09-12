import type { TreePluginKeybindOverrides, TreePluginKeybindValue } from "../config/plugin";

export const treeKeybindCommands = {
  move_up: "tree.move_up",
  move_down: "tree.move_down",
  jump_up: "tree.jump_up",
  jump_down: "tree.jump_down",
  collapse: "tree.collapse",
  expand: "tree.expand",
  select: "tree.select",
  back: "tree.back",
} as const;

export type TreeKeybindName = keyof typeof treeKeybindCommands;
export type TreeKeybindCommand = (typeof treeKeybindCommands)[TreeKeybindName];
export type TreeKeybinds = Readonly<Record<TreeKeybindName, string | false>>;
export const treeRouteCommands = Object.values(treeKeybindCommands);

const treeKeybindDefaults: TreeKeybinds = {
  move_up: "up,k",
  move_down: "down,j",
  jump_up: "shift+up,shift+k",
  jump_down: "shift+down,shift+j",
  collapse: "left,h",
  expand: "right,l",
  select: "return",
  back: "escape,ctrl+c",
};

export function createTreeKeybinds(overrides: TreePluginKeybindOverrides): TreeKeybinds {
  return Object.fromEntries(
    Object.keys(treeKeybindDefaults).map((name) => {
      const key = name as TreeKeybindName;
      return [key, normalizeTreeKeybindValue(overrides[key] ?? treeKeybindDefaults[key])];
    }),
  ) as TreeKeybinds;
}

export function getTreeKeybind(keybinds: TreeKeybinds, name: TreeKeybindName): string | false {
  return keybinds[name];
}

export function formatTreeKeybindLabel(keybinds: TreeKeybinds, name: TreeKeybindName): string {
  const key = keybinds[name];
  if (!key) return "";

  const first = key.split(",")[0]?.trim() ?? "";
  switch (first.toLowerCase()) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    case "left":
      return "←";
    case "right":
      return "→";
    case "return":
      return "enter";
    case "escape":
      return "esc";
    default:
      return first;
  }
}

function normalizeTreeKeybindValue(value: TreePluginKeybindValue): string | false {
  if (value === false || value === "none") return false;
  if (Array.isArray(value)) return value.join(",");
  return value;
}
