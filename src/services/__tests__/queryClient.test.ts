import { describe, expect, it } from "vitest";
import { queryClient } from "@/services/queryClient";
import { HttpRequestError, historyRequestErrorMessage } from "@/services/requestErrors";

describe("request error policy", () => {
  const retry = queryClient.getDefaultOptions().queries?.retry;

  function canRetry(error: Error, failureCount = 0) {
    if (typeof retry !== "function") throw new Error("Expected retry predicate");
    return retry(failureCount, error);
  }

  it.each([401, 403])("does not retry HTTP %s", (status) => {
    expect(canRetry(new HttpRequestError("denied", status, "/api/rpc2"))).toBe(false);
  });

  it.each(["TimeoutError", "AbortError"])("does not restart an exhausted or cancelled %s", (name) => {
    expect(canRetry(new DOMException("stopped", name))).toBe(false);
  });

  it("keeps one retry for recoverable failures", () => {
    const error = new HttpRequestError("unavailable", 503, "/api/rpc2");
    expect(canRetry(error)).toBe(true);
    expect(canRetry(error, 1)).toBe(false);
  });

  it("explains login, permission and timeout failures", () => {
    expect(historyRequestErrorMessage(new HttpRequestError("denied", 401, "/api/rpc2"), "failed"))
      .toContain("重新登录");
    expect(historyRequestErrorMessage(new HttpRequestError("denied", 403, "/api/rpc2"), "failed"))
      .toContain("没有权限");
    expect(historyRequestErrorMessage(new DOMException("expired", "TimeoutError"), "failed"))
      .toContain("查询超时");
    expect(historyRequestErrorMessage(new Error("network down"), "failed")).toBe("failed");
  });
});
