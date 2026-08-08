import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusCard, type StatusScope } from "../../components/StatusCard";

const componentSource = readFileSync(
  new URL("../../components/StatusCard.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../../components/StatusCard.module.css", import.meta.url),
  "utf8",
);

function render(props: Parameters<typeof StatusCard>[0]): string {
  return renderToStaticMarkup(createElement(StatusCard, props));
}

describe("shared Glacier recovery surface", () => {
  it("renders an ordinary 404 with one heading and useful public exits", () => {
    const html = render({ type: "404" });

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("This page isn’t available.");
    expect(html).toContain('href="/search"');
    expect(html).toContain('href="/"');
    expect(html).toContain('data-illustration="error.notFound"');
    expect(html).not.toContain('role="alert"');
  });

  it("makes retry the primary error action and keeps the incident ID selectable", () => {
    const html = render({
      type: "error",
      scope: "host",
      digest: "event-123",
      onReset: () => undefined,
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain("<button");
    expect(html).toContain("Try again");
    expect(html).toContain("<code>event-123</code>");
    expect(html).toContain('href="/host/listings"');
    expect(html.indexOf("Try again")).toBeLessThan(html.indexOf("View your listings"));
    expect(css).toMatch(/\.digest code\s*\{[^}]*user-select:\s*all;/s);
  });

  it("does not promise an incident ID when reporting returns none", () => {
    const html = render({ type: "error", onReset: () => undefined });

    expect(html).toContain("If the problem continues, contact support.");
    expect(html).not.toContain("use the incident ID");
    expect(html).not.toContain("<code>");
  });

  it("keeps error actions outside the assertive announcement", () => {
    const html = render({
      type: "error",
      digest: "event-456",
      onReset: () => undefined,
    });
    const alert = /<div[^>]*role="alert"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1];

    expect(alert).toBeDefined();
    expect(alert).not.toMatch(/<a\b|<button\b|<code\b/);
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf("<code>event-456</code>"));
    expect(html.indexOf("<code>event-456</code>")).toBeLessThan(html.indexOf("<button"));
  });

  it("does not duplicate recovery links when an error has no reset callback", () => {
    const html = render({ type: "error" });

    expect(html.match(/href="\/search"/g)).toHaveLength(1);
    expect(html.match(/href="\/"/g)).toHaveLength(2); // brand + secondary home
    expect(html).toContain("Browse opportunities");
    expect(html).toContain("Go home");
  });

  it.each<[StatusScope, string]>([
    ["public", "/search"],
    ["seeker", "/seek"],
    ["host", "/host/listings"],
    ["admin", "/admin"],
  ])("sends the %s scope to its own recovery destination", (scope, href) => {
    expect(render({ type: "404", scope })).toContain(`href="${href}"`);
  });

  it("accepts route-specific truthful copy and destinations", () => {
    const html = render({
      type: "404",
      title: "This host profile isn’t available.",
      message: "This profile may not be public.",
      destination: { href: "/seek", label: "Browse opportunities" },
      secondaryDestination: { href: "/jobs", label: "Explore work types" },
    });

    expect(html).toContain("This host profile isn’t available.");
    expect(html).toContain("This profile may not be public.");
    expect(html).toContain('href="/seek"');
    expect(html).toContain('href="/jobs"');
  });

  it("uses the design system instead of a second raw palette or novelty scene", () => {
    expect(componentSource).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(componentSource).not.toMatch(/alien|cosmos|orion|off the trail|🐄|🌿/i);
    expect(componentSource).not.toContain("<svg");
    expect(css).toContain("min-block-size: var(--tap-min)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("background: var(--color-action-ground)");
    expect(css).not.toContain("background: var(--color-cta)");
    expect(css).not.toContain("box-shadow: var(--elevation-card)");
  });
});
