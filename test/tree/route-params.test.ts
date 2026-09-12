import { describe, expect, test } from "bun:test";
import {
  getTreeRouteParamsForNavigation,
  isSessionRoute,
  parseTreeRouteParams,
} from "../../src/lib/tree/route-params";

describe("isSessionRoute", () => {
  test("returns true for session route", () => {
    expect(
      isSessionRoute({
        type: "session",
        sessionID: "sess_1",
      }),
    ).toBe(true);
  });

  test("returns false for non-session route", () => {
    expect(isSessionRoute({ type: "home" })).toBe(false);
  });
});

describe("getTreeRouteParamsForNavigation", () => {
  test("captures current session id from session route", () => {
    expect(
      getTreeRouteParamsForNavigation({
        type: "session",
        sessionID: "sess_1",
      }),
    ).toEqual({ sessionID: "sess_1" });
  });

  test("returns undefined outside session route", () => {
    expect(getTreeRouteParamsForNavigation({ type: "home" })).toBeUndefined();
  });
});

describe("parseTreeRouteParams", () => {
  test("reads session id from valid route params", () => {
    expect(parseTreeRouteParams({ sessionID: "sess_1" })).toEqual({ sessionID: "sess_1" });
  });

  test("ignores missing session id", () => {
    expect(parseTreeRouteParams(undefined)).toEqual({});
  });

  test("ignores invalid session id types", () => {
    expect(parseTreeRouteParams({ sessionID: 123 })).toEqual({});
  });
});
