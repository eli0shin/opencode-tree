import { describe, expect, test } from "bun:test";
import { createTreeKeybinds } from "../../src/lib/tree/keybinds";

describe("createTreeKeybinds", () => {
  test("uses ctrl+t to toggle tool turns", () => {
    expect(createTreeKeybinds({}).toggle_tools).toBe("ctrl+t");
  });

  test("accepts a custom tool turn toggle", () => {
    expect(createTreeKeybinds({ toggle_tools: "alt+t" }).toggle_tools).toBe("alt+t");
  });
});
