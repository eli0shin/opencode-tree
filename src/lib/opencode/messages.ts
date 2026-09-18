import type {
  OpenCodeClient,
  SessionMessageAssistant,
  SessionMessageInfo,
  SessionMessageSynthetic,
  SessionMessageUser,
} from "@opencode/client";
import type { FilePart, Message, Part, ReasoningPart, ToolPart } from "./types";
export type {
  AssistantMessage,
  FilePart,
  Message,
  Part,
  ReasoningPart,
  StepFinishPart,
  StepStartPart,
  TextPart,
  ToolPart,
  UserMessage,
} from "./types";
export type { OpenCodeClient, OpenCodeClient as OpencodeClient } from "@opencode/client";
import type { TreeSnapshot } from "../storage";

export type SessionMessageRecord = {
  readonly info: Message;
  readonly parts: readonly Part[];
};

export type SessionTranscriptStatus = "available" | "deleted";

export type SessionTranscript = {
  readonly sessionId: string;
  readonly status: SessionTranscriptStatus;
  readonly messages: readonly SessionMessageRecord[];
  readonly messageById: ReadonlyMap<string, SessionMessageRecord>;
  readonly messageIndexById: ReadonlyMap<string, number>;
};

export type SessionTranscriptMap = Readonly<Record<string, SessionTranscript>>;

export type LoadSessionMessagesPageInput = {
  readonly sessionId: string;
  readonly before?: string;
  readonly limit: number;
};

export type SessionMessagesPage = {
  readonly status: SessionTranscriptStatus;
  readonly items: readonly SessionMessageRecord[];
  readonly nextCursor?: string;
};

export type LoadSessionMessagesPage = (
  input: LoadSessionMessagesPageInput,
) => Promise<SessionMessagesPage>;

export type LoadSessionTranscript = (sessionId: string) => Promise<SessionTranscript>;

export type LoadSnapshotSessionTranscripts = (
  snapshot: TreeSnapshot,
) => Promise<SessionTranscriptMap>;

export type OpenCodeMessagesLoaderOptions = {
  readonly directory?: string;
  readonly workspace?: string;
  readonly pageSize?: number;
};

//TODO: config: make this configurable later
const DEFAULT_PAGE_SIZE = 100;

function compareMessageRecords(left: SessionMessageRecord, right: SessionMessageRecord): number {
  const timeDiff = left.info.time.created - right.info.time.created;
  if (timeDiff !== 0) return timeDiff;
  return left.info.id.localeCompare(right.info.id);
}

function sortTranscriptMessages(
  messages: Iterable<SessionMessageRecord>,
): readonly SessionMessageRecord[] {
  return [...messages].sort(compareMessageRecords);
}

export function createSessionTranscript(input: {
  sessionId: string;
  status: SessionTranscriptStatus;
  messages: readonly SessionMessageRecord[];
}): SessionTranscript {
  const messageById = new Map<string, SessionMessageRecord>();
  const messageIndexById = new Map<string, number>();

  for (const [index, message] of input.messages.entries()) {
    messageById.set(message.info.id, message);
    messageIndexById.set(message.info.id, index);
  }

  return {
    sessionId: input.sessionId,
    status: input.status,
    messages: input.messages,
    messageById,
    messageIndexById,
  };
}

export function createSessionMessagesPageLoader(
  client: OpenCodeClient,
  options: OpenCodeMessagesLoaderOptions = {},
): LoadSessionMessagesPage {
  return async (input) => {
    try {
      const result = await client.message.list({
        sessionID: input.sessionId,
        limit: input.limit,
        ...(!input.before && { order: "desc" as const }),
        cursor: input.before,
      });

      return {
        status: "available",
        items: result.data.flatMap(toSessionMessageRecord),
        nextCursor: result.cursor.next ?? undefined,
      };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return {
        status: "deleted",
        items: [],
      };
    }
  };
}

export async function loadSessionTranscript(
  sessionId: string,
  loadPage: LoadSessionMessagesPage,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<SessionTranscript> {
  const messagesById = new Map<string, SessionMessageRecord>();
  const seenCursors = new Set<string>();

  let before: string | undefined;

  while (true) {
    const page = await loadPage({
      sessionId,
      before,
      limit: pageSize,
    });

    if (page.status === "deleted") {
      return createSessionTranscript({
        sessionId,
        status: "deleted",
        messages: [],
      });
    }

    for (const item of page.items) {
      messagesById.set(item.info.id, item);
    }

    if (!page.nextCursor) {
      return createSessionTranscript({
        sessionId,
        status: "available",
        messages: sortTranscriptMessages(messagesById.values()),
      });
    }

    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`Repeated message pagination cursor for session ${sessionId}`);
    }

    seenCursors.add(page.nextCursor);
    before = page.nextCursor;
  }
}

export async function loadSnapshotSessionTranscripts(
  snapshot: TreeSnapshot,
  loadTranscript: LoadSessionTranscript,
): Promise<SessionTranscriptMap> {
  const sessionIds = Object.keys(snapshot.sessions).sort((left, right) =>
    left.localeCompare(right),
  );
  const entries = await Promise.all(
    sessionIds.map(async (sessionId) => [sessionId, await loadTranscript(sessionId)] as const),
  );

  return Object.fromEntries(entries);
}

export function createSnapshotSessionTranscriptsLoader(
  client: OpenCodeClient,
  options: OpenCodeMessagesLoaderOptions = {},
): LoadSnapshotSessionTranscripts {
  const loadPage = createSessionMessagesPageLoader(client, options);
  return (snapshot) =>
    loadSnapshotSessionTranscripts(snapshot, (sessionId) =>
      loadSessionTranscript(sessionId, loadPage, options.pageSize),
    );
}

function toSessionMessageRecord(message: SessionMessageInfo): SessionMessageRecord[] {
  if (message.type === "user") return [toUserMessageRecord(message)];
  if (message.type === "assistant") return [toAssistantMessageRecord(message)];
  if (message.type === "synthetic") return [toSyntheticMessageRecord(message)];
  return [];
}

function toSyntheticMessageRecord(message: SessionMessageSynthetic): SessionMessageRecord {
  return {
    info: { ...message, role: "user" },
    parts: [{ type: "text", text: message.text }],
  };
}

function toUserMessageRecord(message: SessionMessageUser): SessionMessageRecord {
  const parts: Part[] = [{ type: "text", text: message.text }];
  for (const file of message.files ?? []) {
    parts.push({
      type: "file",
      filename: file.name,
      url: file.source.type === "uri" ? file.source.uri : `data:${file.mime};base64,${file.data}`,
    });
  }
  return { info: { ...message, role: "user" }, parts };
}

function toAssistantMessageRecord(message: SessionMessageAssistant): SessionMessageRecord {
  const parts: Part[] = message.content.map((part) => {
    if (part.type === "tool") {
      return {
        ...part,
        tool: part.name,
        state: {
          ...part.state,
          input:
            typeof part.state.input === "string" ? { input: part.state.input } : part.state.input,
        },
      };
    }
    return part;
  });
  return { info: { ...message, role: "assistant" }, parts };
}

export function getMessageTextReplay(parts: readonly Part[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join("");

  return text?.length ? text : undefined;
}

export function serializeSessionMessageRecordsForSummary(
  messages: readonly SessionMessageRecord[],
): string {
  return messages
    .map(serializeSessionMessageRecordForSummary)
    .filter((blocks) => blocks.length > 0)
    .map((blocks) => blocks.join("\n"))
    .join("\n\n");
}

function serializeSessionMessageRecordForSummary(record: SessionMessageRecord): readonly string[] {
  const text = collectMessageText(record.parts);
  const files = collectMessageFiles(record.parts);
  const fallbackPartTypes = collectFallbackPartTypes(record.parts);

  if (record.info.role === "user") {
    return buildUserMessageBlocks(text, files, fallbackPartTypes);
  }

  return buildAssistantMessageBlocks({
    text,
    reasoning: collectReasoningText(record.parts),
    toolCalls: collectToolCalls(record.parts),
    files,
    fallbackPartTypes,
  });
}

function buildUserMessageBlocks(
  text: string | undefined,
  files: readonly string[],
  fallbackPartTypes: readonly string[],
): readonly string[] {
  const blocks: string[] = [];

  if (text) {
    blocks.push(`[User]: ${text}`);
  }

  if (files.length > 0) {
    blocks.push(`[User files]: ${files.join(", ")}`);
  }

  if (fallbackPartTypes.length > 0) {
    blocks.push(`[User parts]: ${fallbackPartTypes.join(", ")}`);
  }

  return blocks;
}

function buildAssistantMessageBlocks(input: {
  readonly text: string | undefined;
  readonly reasoning: string | undefined;
  readonly toolCalls: readonly string[];
  readonly files: readonly string[];
  readonly fallbackPartTypes: readonly string[];
}): readonly string[] {
  const blocks: string[] = [];

  if (input.reasoning) {
    blocks.push(`[Assistant reasoning]: ${input.reasoning}`);
  }

  if (input.text) {
    blocks.push(`[Assistant]: ${input.text}`);
  }

  if (input.toolCalls.length > 0) {
    blocks.push(`[Assistant tool calls]: ${input.toolCalls.join("; ")}`);
  }

  if (input.files.length > 0) {
    blocks.push(`[Assistant files]: ${input.files.join(", ")}`);
  }

  if (input.fallbackPartTypes.length > 0) {
    blocks.push(`[Assistant parts]: ${input.fallbackPartTypes.join(", ")}`);
  }

  return blocks;
}

function collectMessageText(parts: readonly Part[]): string | undefined {
  return getMessageTextReplay(parts)?.trim() || undefined;
}

function collectReasoningText(parts: readonly Part[]): string | undefined {
  const reasoning = parts
    .filter((part): part is ReasoningPart => part.type === "reasoning")
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join("\n");

  return reasoning.length > 0 ? reasoning : undefined;
}

function collectToolCalls(parts: readonly Part[]): readonly string[] {
  return parts
    .filter((part): part is ToolPart => part.type === "tool")
    .map((part) => formatToolCall(part));
}

function collectMessageFiles(parts: readonly Part[]): readonly string[] {
  const labels: string[] = [];

  for (const part of parts) {
    if (part.type !== "file") continue;
    labels.push(getFilePartLabel(part));
  }

  return labels;
}

function collectFallbackPartTypes(parts: readonly Part[]): readonly string[] {
  return parts
    .filter(
      (part) =>
        !["text", "reasoning", "tool", "file", "step-start", "step-finish"].includes(part.type),
    )
    .map((part) => part.type);
}

function formatToolCall(part: ToolPart): string {
  const args = Object.entries(part.state.input)
    .map(([key, value]) => `${key}=${formatToolArgumentValue(value)}`)
    .join(", ");

  if (!args) {
    return `${part.tool}()`;
  }

  return `${part.tool}(${args})`;
}

function formatToolArgumentValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";

  if (Array.isArray(value) || typeof value === "object") {
    const json = JSON.stringify(value);
    if (json) return json;
  }

  return JSON.stringify(String(value));
}

function getFilePartLabel(part: FilePart): string {
  if (part.filename) return part.filename;

  const source = part.source;
  if (source?.type === "file" || source?.type === "symbol") {
    return source.path;
  }

  if (source?.type === "resource") {
    return source.uri;
  }

  return part.url;
}

function isNotFoundError(error: unknown): error is {
  readonly name?: "NotFoundError";
  readonly _tag?: "SessionNotFoundError";
  readonly data?: { readonly message?: string };
} {
  return (
    typeof error === "object" &&
    error !== null &&
    (("name" in error && error.name === "NotFoundError") ||
      ("_tag" in error && error._tag === "SessionNotFoundError"))
  );
}

function createSessionMessagesLoadError(
  sessionId: string,
  error: unknown,
  statusCode?: number,
): Error {
  const prefix = `Failed to load messages for session ${sessionId}`;
  const message = getSessionMessagesLoadErrorMessage(error);

  if (statusCode !== undefined && message) {
    return new Error(`${prefix} (${statusCode}): ${message}`);
  }

  if (statusCode !== undefined) {
    return new Error(`${prefix} (${statusCode})`);
  }

  if (message) {
    return new Error(`${prefix}: ${message}`);
  }

  return new Error(prefix);
}

function getSessionMessagesLoadErrorMessage(error: unknown): string | undefined {
  if (isNotFoundError(error)) {
    return error.data?.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return data.message;
    }
  }

  return undefined;
}
