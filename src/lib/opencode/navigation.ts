import type { Plugin } from "@opencode/plugin/tui";
import { CliRenderEvents } from "@opentui/core";

export function createTreeSessionNavigator(context: Pick<Plugin.Context, "renderer" | "ui">) {
  let cancelReplay = () => {};

  return {
    navigateToSession(sessionID: string, promptText?: string) {
      cancelReplay();
      context.ui.dialog.clear();

      if (promptText) {
        let active = true;
        const restore = () => {
          if (!active) return;
          const route = context.ui.router.current();
          if (route.type !== "session" || route.sessionID !== sessionID) {
            cancel();
            return;
          }
          const editor = context.renderer.currentFocusedEditor;
          if (!editor || editor.isDestroyed) return;
          cancel();
          editor.gotoBufferEnd();
          editor.insertText(promptText);
        };
        // The session prompt mounts after navigation. Wait for its focus, then
        // let the mount and draft restoration finish before inserting the text.
        const onFocus = () => queueMicrotask(restore);
        const cancel = () => {
          active = false;
          context.renderer.off(CliRenderEvents.FOCUSED_EDITOR, onFocus);
        };
        cancelReplay = cancel;
        context.renderer.on(CliRenderEvents.FOCUSED_EDITOR, onFocus);
        queueMicrotask(restore);
      }

      context.ui.router.navigate({ type: "session", sessionID });
    },
    dispose() {
      cancelReplay();
    },
  };
}
