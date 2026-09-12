export type Message = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly time: { readonly created: number; readonly completed?: number };
  readonly [key: string]: unknown;
};

export type UserMessage = Message & { readonly role: "user" };
export type AssistantMessage = Message & { readonly role: "assistant" };

export type TextPart = {
  readonly type: "text";
  readonly text: string;
  readonly synthetic?: boolean;
  readonly ignored?: boolean;
  readonly [key: string]: unknown;
};

export type ReasoningPart = {
  readonly type: "reasoning";
  readonly text: string;
  readonly [key: string]: unknown;
};

export type ToolPart = {
  readonly type: "tool";
  readonly tool: string;
  readonly state: {
    readonly input: Readonly<Record<string, unknown>>;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
};

export type FilePart = {
  readonly type: "file";
  readonly filename?: string;
  readonly url: string;
  readonly source?:
    | { readonly type: "file" | "symbol"; readonly path: string; readonly [key: string]: unknown }
    | { readonly type: "resource"; readonly uri: string; readonly [key: string]: unknown };
  readonly [key: string]: unknown;
};

export type StepStartPart = { readonly type: "step-start"; readonly [key: string]: unknown };
export type StepFinishPart = { readonly type: "step-finish"; readonly [key: string]: unknown };

export type Part = TextPart | ReasoningPart | ToolPart | FilePart | StepStartPart | StepFinishPart;
