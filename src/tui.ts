import { homedir } from "node:os";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin/tui";
import { createComponent } from "solid-js";
import { parseTreePluginOptions } from "./lib/config/plugin";
import { createSnapshotSessionTranscriptsLoader } from "./lib/opencode/messages";
import { resolveStorageRoot } from "./lib/storage";
import { createTreeKeybinds, formatTreeKeybindLabel } from "./lib/tree/keybinds";
import { TreeRoute } from "./lib/tree/route";
import {
  getTreeRouteParamsForNavigation,
  isSessionRoute,
  parseTreeRouteParams,
} from "./lib/tree/route-params";
import { createTreeTheme } from "./lib/tree/theme";

const routeName = "tree";

export default Plugin.define({
  id: "opencode.tree",
  setup(context) {
    const pluginOptions = parseTreePluginOptions(context.options);
    const treeKeybinds = createTreeKeybinds(pluginOptions.keybinds);

    const unregisterCommands = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "tree.open",
              title: "Tree",
              group: "Plugin",
              palette: true,
              slash: { name: "tree" },
              suggested: () => isSessionRoute(context.ui.router.current()),
              enabled: () => isSessionRoute(context.ui.router.current()),
              run: () => {
                context.ui.router.navigate({
                  type: "plugin",
                  name: routeName,
                  data: getTreeRouteParamsForNavigation(context.ui.router.current()),
                });
                context.ui.dialog.clear();
              },
            },
          ],
        }));
        return null;
      },
    });

    const unregisterRoute = context.ui.router.register({
      name: routeName,
      render: ({ data }) => {
        const routeParams = parseTreeRouteParams(data);
        const projectRoot = resolveTreeProjectRoot(context, routeParams.sessionID);
        const storageRoot = resolveStorageRoot({
          projectRoot,
          stateRoot: resolveOpenCodeStateRoot(),
          storageScope: pluginOptions.storageScope,
        });

        return createComponent(TreeRoute, {
          client: context.client,
          config: {
            storageRoot,
            keybinds: treeKeybinds,
            keybindLabel: (name) => formatTreeKeybindLabel(treeKeybinds, name),
            linesPerJump: pluginOptions.lines_per_jump,
          },
          keymap: context.keymap,
          renderer: context.renderer,
          ui: context.ui,
          projectRoot,
          theme: () => createTreeTheme(context.theme),
          loadSessionTranscripts: createSnapshotSessionTranscriptsLoader(context.client),
          navigateToSession: (sessionID: string) => {
            context.ui.router.navigate({ type: "session", sessionID });
          },
          ...routeParams,
        });
      },
    });

    return () => {
      unregisterCommands();
      unregisterRoute();
    };
  },
});

export function resolveTreeProjectRoot(
  context: Pick<Plugin.Context, "data" | "location">,
  sessionID?: string,
): string {
  return (
    (sessionID ? context.data.session.get(sessionID)?.location.directory : undefined) ??
    context.location?.directory ??
    context.data.location.default().directory
  );
}

function resolveOpenCodeStateRoot(): string {
  return join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "opencode");
}
