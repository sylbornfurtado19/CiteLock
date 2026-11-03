import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

import { ErrorPanel } from "./ErrorPanel";

describe("ErrorPanel", () => {
  it("offers a retry and a way out, announced to assistive tech", () => {
    const html = renderToStaticMarkup(React.createElement(ErrorPanel, { onRetry: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).toContain('href="/dashboard"');
  });

  it("shows only the opaque reference id, never an error message or stack", () => {
    const secret = new Error("connection string postgresql://user:hunter2@db/prod failed");
    const html = renderToStaticMarkup(
      React.createElement(ErrorPanel, { digest: "abc123", onRetry: () => {}, description: "This page hit an unexpected error." })
    );
    expect(html).toContain("Reference: abc123");
    expect(html).not.toContain(secret.message);
    expect(html).not.toContain("hunter2");
  });

  it("omits the retry button when there is nothing to retry", () => {
    expect(renderToStaticMarkup(React.createElement(ErrorPanel, {}))).not.toContain("<button");
  });
});
