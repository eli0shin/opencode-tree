import type { Route } from "@opencode/plugin/tui/context";

export type TreeRouteParams = {
  readonly sessionID?: string;
};

export function isSessionRoute(current: Route): current is Extract<Route, { type: "session" }> {
  return current.type === "session";
}

export function getTreeRouteParamsForNavigation(current: Route): TreeRouteParams | undefined {
  if (!isSessionRoute(current)) return undefined;
  return { sessionID: current.sessionID };
}

export function parseTreeRouteParams(params: Record<string, unknown> | undefined): TreeRouteParams {
  const sessionID = typeof params?.sessionID === "string" ? params.sessionID : undefined;
  return sessionID ? { sessionID } : {};
}
