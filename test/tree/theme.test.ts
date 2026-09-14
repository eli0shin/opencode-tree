import { describe, expect, test } from "bun:test";
import type { ResolvedTheme } from "@opencode/theme/tui";
import type { RGBA } from "@opentui/core";
import { createTreeTheme, getTreeRowForeground } from "../../src/lib/tree/theme";

describe("createTreeTheme", () => {
  test("uses the focused action background for visible keyboard selection", () => {
    const transparentDefault = { name: "transparent-default" } as unknown as RGBA;
    const focused = { name: "focused" } as unknown as RGBA;
    const selectedText = { name: "selected-text" } as unknown as RGBA;
    const color = {} as RGBA;
    const theme = {
      text: {
        default: color,
        subdued: color,
        action: {
          primary: { default: color, focused: selectedText },
          secondary: { default: color },
        },
        feedback: {
          info: { default: color },
          warning: { default: color },
          error: { default: color },
        },
      },
      background: {
        default: color,
        action: {
          primary: { default: transparentDefault, focused },
        },
      },
      border: { default: color },
    } as unknown as ResolvedTheme;

    expect(createTreeTheme(theme).backgroundElement).toBe(focused);
    expect(createTreeTheme(theme).textSelected).toBe(selectedText);
  });

  test("uses contrasting text for a selected tree row", () => {
    const selectedText = { name: "selected-text" } as unknown as RGBA;
    const color = {} as RGBA;
    const theme = {
      text: color,
      textSelected: selectedText,
      textMuted: color,
      background: color,
      backgroundElement: color,
      borderSubtle: color,
      borderActive: color,
      primary: color,
      secondary: color,
      accent: color,
      info: color,
      warning: color,
      error: color,
    };

    const foreground = getTreeRowForeground(theme, { kind: "session", isDeleted: false } as never, {
      selected: true,
      current: false,
    });

    expect(foreground).toBe(selectedText);
  });
});
