### PI-style `/tree` plugin for the OpenCode TUI.

`opencode-tree` adds a tree view for branched conversations without modifying OpenCode core. OpenCode remains the source of truth, while the plugin stores only the branch data needed for navigation and rendering

## [Demo](https://github.com/ishaksebsib/opencode-tree/blob/main/demo.gif)

![opencode-tree demo](./demo.gif)

## Requirements

- OpenCode V2
- OpenTUI 0.5.10 or newer

## Installation

Add the GitHub reference to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:eli0shin/opencode-tree"]
}
```

OpenCode installs the package and loads its precompiled TUI code. No manual clone or compile step is needed.

## Configuration

`~/.config/opencode/opencode.json`

By default, tree state is saved [globally](#global-storage).

Tool turns are hidden when `/tree` opens. Press `Ctrl+T` to show or hide them.

Tree navigation keeps the current session's model and variant. Opening an existing session replaces its model selection with the current selection. New branches use the current selection, not the older source session's selection.

To save it in the current project’s `.opencode` folder instead, set `storageScope` to `local`:

```json
{
  "plugins": [
    {
      "package": "github:eli0shin/opencode-tree",
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
      "package": "github:eli0shin/opencode-tree",
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
          "toggle_tools": "ctrl+t",
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
