import { describe, expect, mock, test } from "bun:test";
import type { SessionInfo } from "@opencode/client";
import type { OpencodeClient } from "../../src/lib/opencode/messages";
import { executeTreeBranchAction, executeTreeSummaryFork } from "../../src/lib/opencode/branch";
import { buildTreeBranchSummaryMessage } from "../../src/lib/opencode/summary";
import type { TreeRegistry, TreeSnapshot } from "../../src/lib/storage";

const snapshot: TreeSnapshot = {
  version: 1,
  treeId: "tree_01",
  rootSessionId: "sess_root",
  sessions: {
    sess_root: {
      sessionId: "sess_root",
      parentSessionId: null,
      anchorMessageId: null,
      children: [],
    },
  },
};

const selectedModel = { providerID: "openai", id: "gpt-6-astra", variant: "high" };

type BranchTestClient = {
  readonly client: OpencodeClient;
  readonly forkSession: ReturnType<typeof mock>;
  readonly getSession: ReturnType<typeof mock>;
  readonly switchModel: ReturnType<typeof mock>;
  readonly promptSession: ReturnType<typeof mock>;
  readonly syntheticSession: ReturnType<typeof mock>;
  readonly deleteSession: ReturnType<typeof mock>;
  readonly appendPrompt: ReturnType<typeof mock>;
  readonly showToast: ReturnType<typeof mock>;
};

function createClient() {
  const forkSession = mock(async () => ({ id: "sess_child" }));
  const getSession = mock(
    async (): Promise<Pick<SessionInfo, "model">> => ({ model: selectedModel }),
  );
  const switchModel = mock(async () => undefined);
  const promptSession = mock(async () => ({ id: "inbox_prompt" }));
  const syntheticSession = mock(async () => ({ id: "inbox_summary" }));
  const deleteSession = mock(async () => undefined);
  const showToast = mock(() => {});

  return {
    client: {
      session: {
        fork: forkSession,
        get: getSession,
        switchModel,
        prompt: promptSession,
        synthetic: syntheticSession,
        remove: deleteSession,
      },
    } as unknown as OpencodeClient,
    forkSession,
    getSession,
    switchModel,
    promptSession,
    syntheticSession,
    deleteSession,
    appendPrompt: promptSession,
    showToast,
  } satisfies BranchTestClient;
}

describe("executeTreeBranchAction", () => {
  test("waits for the full model selection before opening an existing session", async () => {
    const client = createClient();
    let destinationModel: typeof selectedModel | undefined;
    client.switchModel.mockImplementation(async () => {
      await Promise.resolve();
      destinationModel = selectedModel;
    });
    const navigateToSession = mock(() => {
      expect(destinationModel).toEqual(selectedModel);
    });

    await executeTreeBranchAction(
      {
        currentSessionId: "sess_active",
        action: { kind: "switch-session", sessionId: "sess_root" },
        projectRoot: "/repo",
        storageRoot: "/unused",
        snapshot,
      },
      { client: client.client, navigateToSession, showToast: client.showToast },
    );

    expect(navigateToSession).toHaveBeenCalledTimes(1);
  });

  test("preserves a selection with no variant instead of retaining the target variant", async () => {
    const client = createClient();
    const model = { providerID: "other-provider", id: "other-model" };
    client.getSession.mockImplementation(async () => ({ model }));

    await executeTreeBranchAction(
      {
        currentSessionId: "sess_active",
        action: { kind: "switch-session", sessionId: "sess_root" },
        projectRoot: "/repo",
        storageRoot: "/unused",
        snapshot,
      },
      { client: client.client, navigateToSession: () => {}, showToast: client.showToast },
    );

    expect(client.switchModel).toHaveBeenCalledWith({ sessionID: "sess_root", model });
  });

  test("returns to the current session without changing its selection", async () => {
    const client = createClient();
    const navigateToSession = mock(() => {});

    await executeTreeBranchAction(
      {
        currentSessionId: "sess_root",
        action: { kind: "switch-session", sessionId: "sess_root" },
        projectRoot: "/repo",
        storageRoot: "/unused",
        snapshot,
      },
      { client: client.client, navigateToSession, showToast: client.showToast },
    );

    expect(navigateToSession).toHaveBeenCalledWith("sess_root");
    expect(client.getSession).not.toHaveBeenCalled();
    expect(client.switchModel).not.toHaveBeenCalled();
  });

  test("does not navigate if switching the target model fails", async () => {
    const client = createClient();
    client.switchModel.mockImplementation(async () => {
      throw new Error("model switch failed");
    });
    const navigateToSession = mock(() => {});

    await expect(
      executeTreeBranchAction(
        {
          currentSessionId: "sess_active",
          action: { kind: "switch-session", sessionId: "sess_root" },
          projectRoot: "/repo",
          storageRoot: "/unused",
          snapshot,
        },
        { client: client.client, navigateToSession, showToast: client.showToast },
      ),
    ).rejects.toThrow("model switch failed");

    expect(navigateToSession).not.toHaveBeenCalled();
    expect(client.deleteSession).not.toHaveBeenCalled();
  });

  test.each(["fork", "summary"])("removes a new %s if model selection fails", async (kind) => {
    const client = createClient();
    client.switchModel.mockImplementation(async () => {
      throw new Error("model switch failed");
    });
    const navigateToSession = mock(() => {});
    const writeSnapshot = mock(async (_root: string, value: TreeSnapshot) => value);
    const writeRegistry = mock(async (_root: string, value: TreeRegistry) => value);
    const input = {
      currentSessionId: "sess_active",
      plan: { sessionId: "sess_root", anchorMessageId: "msg_user", forkMessageId: "msg_user" },
      projectRoot: "/repo",
      storageRoot: "/unused",
      snapshot,
    };
    const dependencies = {
      client: client.client,
      navigateToSession,
      showToast: client.showToast,
      generateSummary: async () => "Summary",
      storage: {
        readRegistry: async () => ({ version: 1 as const, sessions: {} }),
        writeSnapshot,
        writeRegistry,
      },
    };

    await expect(
      kind === "fork"
        ? executeTreeBranchAction(
            { ...input, action: { kind: "fork", plan: input.plan } },
            dependencies,
          )
        : executeTreeSummaryFork({ ...input, conversation: "Conversation" }, dependencies),
    ).rejects.toThrow("model switch failed");

    expect(client.deleteSession).toHaveBeenCalledWith({ sessionID: "sess_child" });
    expect(client.deleteSession).toHaveBeenCalledTimes(1);
    expect(client.syntheticSession).not.toHaveBeenCalled();
    expect(writeSnapshot).not.toHaveBeenCalled();
    expect(writeRegistry).not.toHaveBeenCalled();
    expect(navigateToSession).not.toHaveBeenCalled();
  });

  test("forks, persists tree state, and navigates without replaying prompt text", async () => {
    const client = createClient();
    const navigateToSession = mock(() => {
      expect(client.switchModel).toHaveBeenCalledWith({
        sessionID: "sess_child",
        model: selectedModel,
      });
    });
    const storageRoot = "/state/opencode/plugins/opencode-tree/projects/repo-123";
    const writeSnapshot = mock(
      async (_storageRoot: string, nextSnapshot: TreeSnapshot) => nextSnapshot,
    );
    const writeRegistry = mock(
      async (_storageRoot: string, nextRegistry: TreeRegistry) => nextRegistry,
    );

    await executeTreeBranchAction(
      {
        currentSessionId: "sess_active",
        action: {
          kind: "fork",
          plan: {
            sessionId: "sess_root",
            anchorMessageId: "msg_user",
            forkMessageId: "msg_user",
          },
        },
        projectRoot: "/repo",
        storageRoot,
        snapshot,
      },
      {
        client: client.client,
        navigateToSession,
        showToast: client.showToast,
        storage: {
          readRegistry: async () => ({
            version: 1,
            sessions: {
              sess_root: "tree_01",
            },
          }),
          writeSnapshot,
          writeRegistry,
        },
      },
    );

    expect(client.forkSession).toHaveBeenCalledWith({
      sessionID: "sess_root",
      before: "msg_user",
    });
    expect(client.getSession).toHaveBeenCalledWith({ sessionID: "sess_active" });
    expect(writeSnapshot).toHaveBeenCalledWith(storageRoot, {
      version: 1,
      treeId: "tree_01",
      rootSessionId: "sess_root",
      sessions: {
        sess_root: {
          sessionId: "sess_root",
          parentSessionId: null,
          anchorMessageId: null,
          children: ["sess_child"],
        },
        sess_child: {
          sessionId: "sess_child",
          parentSessionId: "sess_root",
          anchorMessageId: "msg_user",
          children: [],
        },
      },
    });
    expect(writeRegistry).toHaveBeenCalledWith(storageRoot, {
      version: 1,
      sessions: {
        sess_root: "tree_01",
        sess_child: "tree_01",
      },
    });
    expect(navigateToSession).toHaveBeenCalledWith("sess_child");
    expect(client.appendPrompt).not.toHaveBeenCalled();
  });

  test("switches session without forking when action says switch-session", async () => {
    const client = createClient();
    const navigateToSession = mock(() => {
      expect(client.switchModel).toHaveBeenCalledWith({
        sessionID: "sess_root",
        model: selectedModel,
      });
    });

    await executeTreeBranchAction(
      {
        currentSessionId: "sess_active",
        action: {
          kind: "switch-session",
          sessionId: "sess_root",
        },
        projectRoot: "/repo",
        storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
        snapshot,
      },
      {
        client: client.client,
        navigateToSession,
        showToast: client.showToast,
      },
    );

    expect(navigateToSession).toHaveBeenCalledWith("sess_root");
    expect(client.getSession).toHaveBeenCalledWith({ sessionID: "sess_active" });
    expect(client.forkSession).not.toHaveBeenCalled();
    expect(client.appendPrompt).not.toHaveBeenCalled();
  });

  test("does nothing for noop action", async () => {
    const client = createClient();
    const navigateToSession = mock(() => {});

    await executeTreeBranchAction(
      {
        currentSessionId: "sess_active",
        action: {
          kind: "noop",
        },
        projectRoot: "/repo",
        storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
        snapshot,
      },
      {
        client: client.client,
        navigateToSession,
        showToast: client.showToast,
      },
    );

    expect(navigateToSession).not.toHaveBeenCalled();
    expect(client.forkSession).not.toHaveBeenCalled();
    expect(client.appendPrompt).not.toHaveBeenCalled();
    expect(client.showToast).not.toHaveBeenCalled();
    expect(client.getSession).not.toHaveBeenCalled();
    expect(client.switchModel).not.toHaveBeenCalled();
  });

  test("shows toast for notice action", async () => {
    const client = createClient();

    await executeTreeBranchAction(
      {
        currentSessionId: "sess_active",
        action: {
          kind: "show-notice",
          message: "Select a message row first.",
          variant: "info",
        },
        projectRoot: "/repo",
        storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
        snapshot,
      },
      {
        client: client.client,
        navigateToSession: () => {},
        showToast: client.showToast,
      },
    );

    expect(client.showToast).toHaveBeenCalledWith({
      message: "Select a message row first.",
      variant: "info",
    });
  });

  test("generates summary and injects it without replaying user text", async () => {
    const client = createClient();
    client.syntheticSession.mockImplementation(async () => {
      expect(client.switchModel).toHaveBeenCalledWith({
        sessionID: "sess_child",
        model: selectedModel,
      });
      return { id: "inbox_summary" };
    });
    const navigateToSession = mock(() => {});
    const storageRoot = "/state/opencode/plugins/opencode-tree/projects/repo-123";
    const writeSnapshot = mock(
      async (_storageRoot: string, nextSnapshot: TreeSnapshot) => nextSnapshot,
    );
    const writeRegistry = mock(
      async (_storageRoot: string, nextRegistry: TreeRegistry) => nextRegistry,
    );
    const generateSummary = mock(async () => "## Goal\nShip it");

    await executeTreeSummaryFork(
      {
        currentSessionId: "sess_active",
        plan: {
          sessionId: "sess_root",
          anchorMessageId: "msg_user",
          forkMessageId: "msg_user",
        },
        projectRoot: "/repo",
        storageRoot,
        snapshot,
        conversation: "[User]: fix this",
        customInstructions: "focus on blockers",
      },
      {
        client: client.client,
        generateSummary,
        navigateToSession,
        showToast: client.showToast,
        storage: {
          readRegistry: async () => ({
            version: 1,
            sessions: {
              sess_root: "tree_01",
            },
          }),
          writeSnapshot,
          writeRegistry,
        },
      },
    );

    expect(generateSummary).toHaveBeenCalledWith(
      {
        projectRoot: "/repo",
        conversation: "[User]: fix this",
        customInstructions: "focus on blockers",
        signal: undefined,
      },
      { client: client.client },
    );
    expect(client.forkSession).toHaveBeenCalledWith({
      sessionID: "sess_root",
      before: "msg_user",
    });
    expect(client.getSession).toHaveBeenCalledWith({ sessionID: "sess_active" });
    expect(client.syntheticSession).toHaveBeenCalledWith({
      sessionID: "sess_child",
      text: buildTreeBranchSummaryMessage("## Goal\nShip it"),
    });
    expect(writeSnapshot).toHaveBeenCalled();
    expect(writeRegistry).toHaveBeenCalled();
    expect(navigateToSession).toHaveBeenCalledWith("sess_child");
    expect(client.appendPrompt).not.toHaveBeenCalled();
  });

  test("does not fork when summary generation fails", async () => {
    const client = createClient();

    await expect(
      executeTreeSummaryFork(
        {
          currentSessionId: "sess_active",
          plan: {
            sessionId: "sess_root",
            anchorMessageId: "msg_user",
            forkMessageId: "msg_user",
          },
          projectRoot: "/repo",
          storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
          snapshot,
          conversation: "[User]: fix this",
        },
        {
          client: client.client,
          generateSummary: async () => {
            throw new Error("summary failed");
          },
          navigateToSession: () => {},
          showToast: client.showToast,
        },
      ),
    ).rejects.toThrow("summary failed");

    expect(client.forkSession).not.toHaveBeenCalled();
    expect(client.syntheticSession).not.toHaveBeenCalled();
  });

  test("deletes the forked session if writing the summary into it fails", async () => {
    const client = createClient();
    client.syntheticSession.mockImplementation(async () => {
      throw new Error("inject failed");
    });

    await expect(
      executeTreeSummaryFork(
        {
          currentSessionId: "sess_active",
          plan: {
            sessionId: "sess_root",
            anchorMessageId: "msg_user",
            forkMessageId: "msg_user",
          },
          projectRoot: "/repo",
          storageRoot: "/state/opencode/plugins/opencode-tree/projects/repo-123",
          snapshot,
          conversation: "[User]: fix this",
        },
        {
          client: client.client,
          generateSummary: async () => "## Goal\nShip it",
          navigateToSession: () => {},
          showToast: client.showToast,
        },
      ),
    ).rejects.toThrow("inject failed");

    expect(client.deleteSession).toHaveBeenCalledWith({
      sessionID: "sess_child",
    });
  });
});
