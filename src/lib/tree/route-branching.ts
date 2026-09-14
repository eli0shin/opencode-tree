/** @jsxImportSource @opentui/solid */

import type { Plugin } from "@opencode/plugin/tui";
import type { OpenCodeClient } from "@opencode/client";
import {
  createComponent,
  createEffect,
  createMemo,
  createSignal,
  on,
  type Accessor,
} from "solid-js";
import { executeTreeBranchAction, executeTreeSummaryFork } from "../opencode/branch";
import {
  serializeSessionMessageRecordsForSummary,
  type SessionTranscriptMap,
} from "../opencode/messages";
import type { TreeBootstrapResult } from "./bootstrap";
import { collectTreeBranchSummarySlice, type TreeBranchAction } from "./branch";
import {
  TreeBranchSummaryDialog,
  type TreeBranchSummaryDialogUI,
} from "./components/branch-summary-dialog";
import type { TreeFlatRow } from "./flatten";
import type { TreeKeybindName, TreeKeybinds } from "./keybinds";
import type { TreeTheme } from "./theme";

type TreeForkAction = Extract<TreeBranchAction, { kind: "fork" }>;

export type TreeBranchSummaryRequest =
  | {
      readonly kind: "no-summary";
    }
  | {
      readonly kind: "summarize";
      readonly customInstructions?: string;
    };

export type TreeRouteBusyState =
  | {
      readonly kind: "branching";
    }
  | {
      readonly kind: "summarizing";
      readonly controller: AbortController;
    };

export type TreeRouteBranchControllerInput = {
  readonly client: OpenCodeClient;
  readonly keybinds: TreeKeybinds;
  readonly keybindLabel: (name: TreeKeybindName) => string;
  readonly keymap: Plugin.Context["keymap"];
  readonly ui: Pick<Plugin.Context["ui"], "dialog" | "toast"> & TreeBranchSummaryDialogUI;
  readonly theme: Accessor<TreeTheme>;
  readonly navigateToSession: (sessionId: string) => void | Promise<void>;
  readonly bootstrap: Accessor<TreeBootstrapResult | undefined>;
  readonly projectedTreeData: Accessor<
    | {
        readonly transcripts: SessionTranscriptMap;
      }
    | undefined
  >;
  readonly selectedRow: Accessor<TreeFlatRow | undefined>;
};

export type TreeRouteBranchController = {
  readonly busyState: Accessor<TreeRouteBusyState | undefined>;
  readonly busy: Accessor<boolean>;
  readonly actionErrorMessage: Accessor<string | undefined>;
  readonly cancelActiveSummary: () => void;
  readonly openBranchSummaryDialog: (action: TreeForkAction) => void;
  readonly runTreeBranchAction: (action: TreeBranchAction) => void;
};

export function createTreeRouteBranchController(
  input: TreeRouteBranchControllerInput,
): TreeRouteBranchController {
  const [busyState, setBusyState] = createSignal<TreeRouteBusyState | undefined>();
  const [actionErrorMessage, setActionErrorMessage] = createSignal<string | undefined>();
  const [summaryDialogAction, setSummaryDialogAction] = createSignal<TreeForkAction | undefined>();
  const busy = createMemo(() => busyState() !== undefined);

  const cancelActiveSummary = () => {
    const currentBusyState = busyState();
    if (currentBusyState?.kind !== "summarizing") return;
    currentBusyState.controller.abort();
  };

  const closeSummaryDialog = () => {
    setSummaryDialogAction(undefined);
    input.ui.dialog.clear();
  };

  const runTreeBranchAction = (action: TreeBranchAction) => {
    const bootstrapResult = input.bootstrap();
    if (!bootstrapResult || bootstrapResult.kind === "missing-session-context") return;

    setActionErrorMessage(undefined);
    setBusyState({ kind: "branching" });
    void executeTreeBranchAction(
      {
        action,
        projectRoot: bootstrapResult.projectRoot,
        storageRoot: bootstrapResult.storageRoot,
        snapshot: bootstrapResult.snapshot,
      },
      {
        client: input.client,
        navigateToSession: input.navigateToSession,
        showToast: (toast) => input.ui.toast.show(toast),
      },
    )
      .catch((error) => {
        setActionErrorMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        setBusyState(undefined);
      });
  };

  const runTreeSummaryBranchAction = async (
    action: TreeForkAction,
    request: Exclude<TreeBranchSummaryRequest, { kind: "no-summary" }>,
  ): Promise<void> => {
    const bootstrapResult = input.bootstrap();
    const treeData = input.projectedTreeData();
    if (!bootstrapResult || bootstrapResult.kind === "missing-session-context" || !treeData) return;

    const controller = new AbortController();

    setActionErrorMessage(undefined);
    setBusyState({ kind: "summarizing", controller });

    try {
      const summarySlice = collectTreeBranchSummarySlice({
        row: input.selectedRow(),
        transcripts: treeData.transcripts,
      });
      const conversation = serializeSessionMessageRecordsForSummary(summarySlice.messages);

      await executeTreeSummaryFork(
        {
          plan: action.plan,
          projectRoot: bootstrapResult.projectRoot,
          storageRoot: bootstrapResult.storageRoot,
          snapshot: bootstrapResult.snapshot,
          conversation,
          customInstructions: request.customInstructions,
          signal: controller.signal,
        },
        {
          client: input.client,
          navigateToSession: input.navigateToSession,
          showToast: (toast) => input.ui.toast.show(toast),
        },
      );

      closeSummaryDialog();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      closeSummaryDialog();

      if (message === "Summary generation cancelled.") {
        return;
      }

      setActionErrorMessage(`Summary generation failed: ${message}`);
    } finally {
      setBusyState(undefined);
    }
  };

  const handleBranchSummaryRequest = (
    action: TreeForkAction,
    request: TreeBranchSummaryRequest,
  ): Promise<void> | void => {
    if (request.kind === "no-summary") {
      closeSummaryDialog();
      runTreeBranchAction(action);
      return;
    }

    return runTreeSummaryBranchAction(action, request);
  };

  const openBranchSummaryDialog = (action: TreeForkAction) => {
    setActionErrorMessage(undefined);
    setSummaryDialogAction(action);
  };

  createEffect(
    on(summaryDialogAction, (nextDialogAction) => {
      if (!nextDialogAction) return;

      input.ui.dialog.show(
        () =>
          createComponent(TreeBranchSummaryDialog, {
            keybinds: input.keybinds,
            keybindLabel: input.keybindLabel,
            keymap: input.keymap,
            ui: input.ui,
            theme: input.theme(),
            onClose: closeSummaryDialog,
            onCancelBusy: cancelActiveSummary,
            onSelect: (request) => handleBranchSummaryRequest(nextDialogAction, request),
          }),
        () => {
          cancelActiveSummary();
          setSummaryDialogAction((currentDialogAction) =>
            currentDialogAction === nextDialogAction ? undefined : currentDialogAction,
          );
        },
      );
    }),
  );

  return {
    busyState,
    busy,
    actionErrorMessage,
    cancelActiveSummary,
    openBranchSummaryDialog,
    runTreeBranchAction,
  };
}
