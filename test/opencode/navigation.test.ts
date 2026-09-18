import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Plugin } from "@opencode/plugin/tui";
import { CliRenderEvents, TextareaRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { createTreeSessionNavigator } from "../../src/lib/opencode/navigation";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

async function createHarness() {
  const view = await createTestRenderer({ width: 80, height: 12 });
  cleanups.push(() => view.renderer.destroy());
  let route: ReturnType<Plugin.Context["ui"]["router"]["current"]> = {
    type: "plugin",
    id: "opencode.tree",
    name: "tree",
  };
  const clear = mock(() => {});
  const context = {
    renderer: view.renderer,
    ui: {
      dialog: { clear },
      router: {
        current: () => route,
        navigate: (next: typeof route) => {
          view.renderer.currentFocusedEditor?.destroy();
          route = next;
        },
      },
    },
  } as unknown as Pick<Plugin.Context, "renderer" | "ui">;
  const navigation = createTreeSessionNavigator(context);
  cleanups.push(() => navigation.dispose());
  const submit = mock(() => {});
  const change = mock(() => {});
  const mountEditor = (initialValue = "") => {
    const editor = new TextareaRenderable(view.renderer, {
      width: 70,
      height: 4,
      initialValue,
      onSubmit: submit,
      onContentChange: change,
    });
    view.renderer.root.add(editor);
    editor.focus();
    return editor;
  };
  return { view, context, navigation, mountEditor, submit, change, clear };
}

describe("tree session prompt restoration", () => {
  test("waits for the new prompt and inserts the full text without submitting", async () => {
    const h = await createHarness();
    const treeInput = h.mountEditor("tree search");
    h.navigation.navigateToSession("sess_child", "  original user text\nsecond line\n");
    await Promise.resolve();
    expect(treeInput.isDestroyed).toBe(true);
    expect(h.context.ui.router.current()).toEqual({ type: "session", sessionID: "sess_child" });

    const prompt = h.mountEditor();
    await h.view.renderOnce();
    expect(prompt.plainText).toBe("  original user text\nsecond line\n");
    expect(h.change).toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.view.renderer.listenerCount(CliRenderEvents.FOCUSED_EDITOR)).toBe(0);

    prompt.blur();
    prompt.focus();
    await h.view.renderOnce();
    expect(prompt.plainText).toBe("  original user text\nsecond line\n");
  });

  test("inserts after mount-time draft restoration", async () => {
    const h = await createHarness();
    h.navigation.navigateToSession("sess_child", "selected text");
    const prompt = h.mountEditor();
    prompt.setText("existing draft\n");
    await h.view.renderOnce();
    expect(prompt.plainText).toBe("existing draft\nselected text");
  });

  test("does not replay text when navigating without a user message", async () => {
    const h = await createHarness();
    h.navigation.navigateToSession("sess_child");
    const prompt = h.mountEditor("existing draft");
    await h.view.renderOnce();
    expect(prompt.plainText).toBe("existing draft");
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.view.renderer.listenerCount(CliRenderEvents.FOCUSED_EDITOR)).toBe(0);
  });

  test("cancels pending text when another session opens", async () => {
    const h = await createHarness();
    h.navigation.navigateToSession("sess_child", "do not insert");
    h.context.ui.router.navigate({ type: "session", sessionID: "sess_other" });
    const prompt = h.mountEditor();
    await h.view.renderOnce();
    expect(prompt.plainText).toBe("");
    expect(h.view.renderer.listenerCount(CliRenderEvents.FOCUSED_EDITOR)).toBe(0);
  });

  test("replaces a pending replay when navigating again", async () => {
    const h = await createHarness();
    h.navigation.navigateToSession("sess_first", "old text");
    h.navigation.navigateToSession("sess_second", "new text");
    const prompt = h.mountEditor();
    await h.view.renderOnce();
    expect(prompt.plainText).toBe("new text");
  });

  test("removes a pending replay when the plugin unloads", async () => {
    const h = await createHarness();
    h.navigation.navigateToSession("sess_child", "do not insert");
    h.navigation.dispose();
    const prompt = h.mountEditor();
    await h.view.renderOnce();
    expect(prompt.plainText).toBe("");
    expect(h.view.renderer.listenerCount(CliRenderEvents.FOCUSED_EDITOR)).toBe(0);
  });
});
