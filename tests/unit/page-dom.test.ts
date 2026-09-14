// @vitest-environment jsdom
import { it, expect } from "vitest";
import {
  collectGroups,
  serialize,
  render,
} from "../../src/content/page-translation/dom";
it("collects mixed containers once and excludes inputs and private content", () => {
  document.body.innerHTML =
    "<main>Intro <b>bold</b><p>Paragraph</p>Tail<ul><li>Item<ul><li>Nested</li></ul></li></ul><textarea>SECRET</textarea><div contenteditable>PRIVATE</div><p hidden>HIDDEN</p></main>";
  const texts = collectGroups(document.body).map((g) => serialize(g).text);
  expect(texts).toEqual(["Intro bold", "Paragraph", "Tail", "Item", "Nested"]);
});
it("preserves inline formatting and existing nodes and restores by removing only hosts", () => {
  document.body.innerHTML =
    '<p id="source">Read <strong>this</strong> <a href="https://example.com">link</a></p>';
  const source = document.querySelector("#source")!;
  const original = source.firstChild;
  const group = collectGroups(document.body)[0]!;
  const serial = serialize(group);
  const { host, degraded } = render(
    group,
    serial,
    serial.html.replace("Read", "阅读").replace("this", "此"),
    "html" === "html",
    "zh-CN",
  );
  expect(degraded).toBe(false);
  expect(host.shadowRoot?.querySelector("strong")?.textContent).toBe("此");
  expect(host.shadowRoot?.querySelector("a")?.href).toBe(
    "https://example.com/",
  );
  expect(source.firstChild).toBe(original);
  host.remove();
  expect(source.textContent).toBe("Read this link");
});
it("never trusts returned attributes, URLs or executable elements", () => {
  document.body.innerHTML = "<p>Hello <strong>world</strong></p>";
  const group = collectGroups(document.body)[0]!;
  const serial = serialize(group);
  const { host, degraded } = render(
    group,
    serial,
    '<img src="https://evil.test/pixel"><script>alert(1)</script><span onclick="bad()">safe</span>',
    true,
    "zh-CN",
  );
  expect(degraded).toBe(true);
  expect(host.shadowRoot?.querySelector("img,script,[onclick]")).toBeNull();
  expect(host.shadowRoot?.textContent).toContain("safe");
});
it("places translations inside table cells and list items, not between invalid siblings", () => {
  document.body.innerHTML =
    "<ul><li>Item</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table>";
  for (const group of collectGroups(document.body))
    render(group, serialize(group), "译文", false, "zh-CN");
  expect(document.querySelector("li > [data-flow-translation]")).not.toBeNull();
  expect(document.querySelector("td > [data-flow-translation]")).not.toBeNull();
  expect(document.querySelector("tr > span")).toBeNull();
});

it("does not serialize CSS-hidden inline content or collapsed blocks", () => {
  document.body.innerHTML = '<p>Public <span style="content-visibility:hidden">SECRET</span><span style="visibility:collapse">PRIVATE</span></p><p style="visibility:collapse">COLLAPSED</p>';
  const sources = collectGroups(document.body).map(serialize);
  expect(sources.map(s => s.text)).toEqual(["Public"]);
  expect(sources.map(s => s.html).join("")).not.toMatch(/SECRET|PRIVATE|COLLAPSED/);
});
