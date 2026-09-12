import type { ResolvedTheme } from "@opencode/theme/tui";
import type { RGBA } from "@opentui/core";
import type { TreeFlatRow } from "./flatten";

export type TreeTheme = {
  readonly text: RGBA;
  readonly textMuted: RGBA;
  readonly background: RGBA;
  readonly backgroundElement: RGBA;
  readonly borderSubtle: RGBA;
  readonly borderActive: RGBA;
  readonly primary: RGBA;
  readonly secondary: RGBA;
  readonly accent: RGBA;
  readonly info: RGBA;
  readonly warning: RGBA;
  readonly error: RGBA;
};

export function createTreeTheme(theme: ResolvedTheme): TreeTheme {
  return {
    text: theme.text.default,
    textMuted: theme.text.subdued,
    background: theme.background.default,
    backgroundElement: theme.background.action.primary.default,
    borderSubtle: theme.border.default,
    borderActive: theme.text.action.primary.default,
    primary: theme.text.action.primary.default,
    secondary: theme.text.action.secondary.default,
    accent: theme.text.action.primary.default,
    info: theme.text.feedback.info.default,
    warning: theme.text.feedback.warning.default,
    error: theme.text.feedback.error.default,
  };
}

export type TreeThemePalette = {
  readonly screenBackground: RGBA;
  readonly panelBackground: RGBA;
  readonly panelBorder: RGBA;
  readonly selectedRowBackground: RGBA;
  readonly selectedRowBorder: RGBA;
  readonly guideText: RGBA;
  readonly helpText: RGBA;
  readonly helpKey: RGBA;
  readonly loadingText: RGBA;
  readonly emptyText: RGBA;
  readonly errorText: RGBA;
  readonly noticeText: RGBA;
  readonly branchingText: RGBA;
};

export type TreeRowStyleState = {
  readonly selected: boolean;
  readonly current: boolean;
};

export function mapTreeTheme(theme: TreeTheme): TreeThemePalette {
  return {
    screenBackground: theme.background,
    panelBackground: theme.background,
    panelBorder: theme.borderSubtle,
    selectedRowBackground: theme.backgroundElement,
    selectedRowBorder: theme.borderActive,
    guideText: theme.primary,
    helpText: theme.textMuted,
    helpKey: theme.text,
    loadingText: theme.info,
    emptyText: theme.textMuted,
    errorText: theme.error,
    noticeText: theme.warning,
    branchingText: theme.accent,
  };
}

export function getTreeRowForeground(
  theme: TreeTheme,
  row: TreeFlatRow,
  _state: TreeRowStyleState,
): RGBA {
  if (row.kind === "session") {
    if (row.isDeleted) return theme.error;
    return theme.secondary;
  }

  if (row.role === "assistant") {
    return theme.textMuted;
  }

  if (row.role === "user") {
    return theme.primary;
  }

  return theme.text;
}

export function getTreeRowBackground(theme: TreeTheme, state: TreeRowStyleState): RGBA | undefined {
  if (!state.selected) return undefined;
  return theme.backgroundElement;
}

export function getTreeRowBorder(theme: TreeTheme, state: TreeRowStyleState): RGBA | undefined {
  if (!state.selected) return undefined;
  return theme.borderActive;
}
