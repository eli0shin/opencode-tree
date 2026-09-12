import { describe, expect, mock, test } from "bun:test";
import type { OpencodeClient } from "../../src/lib/opencode/messages";
import {
  buildTreeBranchSummaryPrompt,
  generateTreeBranchSummary,
  TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT,
} from "../../src/lib/opencode/summary";

function createClient() {
  const createSession = mock(async () => ({ id: "sess_summary" }));
  const generateSession = mock(async () => ({ text: "## Goal\nShip it" }));
  const interruptSession = mock(async () => ({ interrupted: true }));
  const removeSession = mock(async () => undefined);
  const client = {
    session: {
      create: createSession,
      generate: generateSession,
      interrupt: interruptSession,
      remove: removeSession,
    },
  } as unknown as OpencodeClient;

  return { client, createSession, generateSession, interruptSession, removeSession };
}

describe("generateTreeBranchSummary", () => {
  test("creates helper session, generates summary, and removes helper session", async () => {
    const client = createClient();

    await expect(
      generateTreeBranchSummary(
        {
          projectRoot: "/repo",
          conversation: "[User]: fix this",
          customInstructions: "focus on blockers",
        },
        { client: client.client },
      ),
    ).resolves.toBe("## Goal\nShip it");

    expect(client.createSession).toHaveBeenCalledWith({
      title: "Tree branch summary",
      location: { directory: "/repo" },
      agent: undefined,
      model: undefined,
    });
    expect(client.generateSession).toHaveBeenCalledWith({
      sessionID: "sess_summary",
      prompt: `${TREE_BRANCH_SUMMARIZATION_SYSTEM_PROMPT}\n\n${buildTreeBranchSummaryPrompt({
        conversation: "[User]: fix this",
        customInstructions: "focus on blockers",
      })}`,
    });
    expect(client.removeSession).toHaveBeenCalledWith({ sessionID: "sess_summary" });
  });

  test("interrupts and removes helper session on cancellation", async () => {
    const client = createClient();
    const controller = new AbortController();
    client.generateSession.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(createAbortError()), {
            once: true,
          });
        }),
    );
    setTimeout(() => controller.abort());

    await expect(
      generateTreeBranchSummary(
        { projectRoot: "/repo", conversation: "[User]: fix this", signal: controller.signal },
        { client: client.client },
      ),
    ).rejects.toThrow("Summary generation cancelled.");

    expect(client.interruptSession).toHaveBeenCalledWith({ sessionID: "sess_summary" });
    expect(client.removeSession).toHaveBeenCalledWith({ sessionID: "sess_summary" });
  });

  test("treats helper session interrupt failure as a generation failure", async () => {
    const client = createClient();
    const controller = new AbortController();
    client.generateSession.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(createAbortError()), {
            once: true,
          });
        }),
    );
    client.interruptSession.mockImplementation(async () => ({ interrupted: false }));
    setTimeout(() => controller.abort());

    await expect(
      generateTreeBranchSummary(
        { projectRoot: "/repo", conversation: "[User]: fix this", signal: controller.signal },
        { client: client.client },
      ),
    ).rejects.toThrow("Summary helper session abort did not succeed");
  });

  test("removes helper session when generation fails", async () => {
    const client = createClient();
    client.generateSession.mockImplementation(async () => {
      throw new Error("Provider unavailable");
    });

    await expect(
      generateTreeBranchSummary(
        { projectRoot: "/repo", conversation: "[User]: fix this" },
        { client: client.client },
      ),
    ).rejects.toThrow("Provider unavailable");
    expect(client.removeSession).toHaveBeenCalledWith({ sessionID: "sess_summary" });
  });

  test("reports helper session cleanup failure", async () => {
    const client = createClient();
    client.removeSession.mockImplementation(async () => {
      throw new Error("Session busy");
    });

    await expect(
      generateTreeBranchSummary(
        { projectRoot: "/repo", conversation: "[User]: fix this" },
        { client: client.client },
      ),
    ).rejects.toThrow("Session busy");
  });

  test("combines generation and cleanup failures", async () => {
    const client = createClient();
    client.generateSession.mockImplementation(async () => {
      throw new Error("Provider unavailable");
    });
    client.removeSession.mockImplementation(async () => {
      throw new Error("Session busy");
    });

    await expect(
      generateTreeBranchSummary(
        { projectRoot: "/repo", conversation: "[User]: fix this" },
        { client: client.client },
      ),
    ).rejects.toThrow("Provider unavailable; cleanup failed: Session busy");
  });
});

function createAbortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
