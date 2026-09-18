import { plugin } from "bun";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sourceDirectory = fileURLToPath(new URL("./", import.meta.url));
const sourcePattern = sourceDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// OpenCode's Solid transform skips node_modules. Transform only this package's
// TSX, before importing the UI, so Git installs retain Solid's reactive getters.
plugin({
  name: "opencode-tree-solid",
  setup(build) {
    build.onLoad({ filter: new RegExp(`^${sourcePattern}.*\\.tsx(?:[?#].*)?$`) }, async (args) => {
      const filename = args.path.replace(/[?#].*$/, "");
      const { transformAsync } = await import("@babel/core");
      const result = await transformAsync(await Bun.file(filename).text(), {
        filename,
        configFile: false,
        babelrc: false,
        presets: [
          [
            require.resolve("babel-preset-solid"),
            { moduleName: "@opentui/solid", generate: "universal" },
          ],
          require.resolve("@babel/preset-typescript"),
        ],
      });
      if (!result?.code) throw new Error(`Failed to transform tree component: ${filename}`);
      return { contents: result.code, loader: "js" };
    });
  },
});

const { default: treePlugin, resolveTreeProjectRoot } = await import("./tui-plugin");
export { resolveTreeProjectRoot };
export default treePlugin;
