### PI-style `/tree` plugin for the OpenCode TUI.

`opencode-tree` adds a tree view for branched conversations without modifying OpenCode core. OpenCode remains the source of truth, while the plugin stores only the branch data needed for navigation and rendering

## [Demo](https://github.com/ishaksebsib/opencode-tree/blob/main/demo.gif)

![opencode-tree demo](./demo.gif)

## Requirements

- OpenCode V2
- OpenTUI 0.5.10 or newer

## Installation

Clone this repository and build the plugin:

```bash
git clone https://github.com/eli0shin/opencode-tree.git
cd opencode-tree
bun install
bun run build
```

Add the checkout path to `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["/absolute/path/to/opencode-tree"]
}
```

This is a CLI plugin. Do not add it to `opencode.json`; that file configures server plugins.

## Configuration

`~/.config/opencode/cli.json`

By default, tree state is saved [globally](#global-storage).

To save it in the current project’s `.opencode` folder instead, set `storageScope` to `local`:

```json
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-tree",
      "options": { "storageScope": "local" }
    }
  ]
}
```

### Full Configuration

All options are optional. This example shows the default values:

```json
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-tree",
      "options": {
        "storageScope": "global",
        "lines_per_jump": 20,
        "keybinds": {
          "move_up": "up,k",
          "move_down": "down,j",
          "jump_up": "shift+up,shift+k",
          "jump_down": "shift+down,shift+j",
          "collapse": "left,h",
          "expand": "right,l",
          "select": "return",
          "back": "escape,ctrl+c"
        }
      }
    }
  ]
}
```

## Storage

- if `local`: `<projectRoot>/.opencode/opencode-tree/`
- <a id="global-storage"></a>if `global`: `<opencode-state>/plugins/opencode-tree/`
  - Where `<opencode-state>` is:
    - All platforms: `${XDG_STATE_HOME:-~/.local/state}/opencode`
