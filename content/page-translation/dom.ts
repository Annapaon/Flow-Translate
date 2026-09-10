import { parseFragment } from "parse5";
export const HOST = "data-flow-translation";
const excluded =
  "script,style,noscript,iframe,svg,canvas,math,pre,input,textarea,select,button,nav,header[role=banner],[role=navigation],[role=button],[contenteditable]:not([contenteditable=false]),[translate=no],.notranslate,[hidden],[aria-hidden=true],#flow-translate-root,[data-flow-translation]";
const blockTags = new Set([
  "P",
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "ASIDE",
  "FOOTER",
  "HEADER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TD",
  "TH",
  "BLOCKQUOTE",
  "FIGCAPTION",
  "DL",
  "DT",
  "DD",
]);
export interface Group {
  owner: HTMLElement;
  nodes: Node[];
  anchor: Node;
}
export interface Inline {
  tag: string;
  href?: string;
  code?: string;
}
export interface Serialized {
  text: string;
  html: string;
  inline: Map<string, Inline>;
}
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function* groupSteps(root: HTMLElement): Generator<Group | null> {
  function* walk(owner: HTMLElement): Generator<Group | null> {
    yield null;
    if (owner.matches(excluded)) return;
    const style = getComputedStyle(owner);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.contentVisibility === "hidden"
    )
      return;
    let nodes: Node[] = [];
    function* flush(): Generator<Group> {
      if (nodes.some((n) => n.textContent?.trim()))
        yield { owner, nodes, anchor: nodes[nodes.length - 1]! };
      nodes = [];
    }
    for (const node of [...owner.childNodes]) {
      yield null;
      if (node instanceof HTMLElement) {
        if (node.matches(excluded)) {
          yield* flush();
          continue;
        }
        const display = getComputedStyle(node).display;
        if (
          blockTags.has(node.tagName) ||
          ["block", "flex", "grid", "list-item", "table-cell"].includes(display)
        ) {
          yield* flush();
          yield* walk(node);
          continue;
        }
      }
      if (node.nodeType === Node.TEXT_NODE || node instanceof HTMLElement)
        nodes.push(node);
    }
    yield* flush();
  }
  yield* walk(root);
}
export function collectGroups(root: HTMLElement): Group[] {
  return [...groupSteps(root)].filter(
    (group): group is Group => group !== null,
  );
}
export async function collectGroupsAsync(
  root: HTMLElement,
  valid: () => boolean,
): Promise<Group[]> {
  const groups: Group[] = [];
  let count = 0;
  for (const group of groupSteps(root)) {
    if (!valid()) return [];
    if (group) groups.push(group);
    if (++count % 100 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return groups;
}
export function serialize(group: Group): Serialized {
  const inline = new Map<string, Inline>();
  let text = "";
  function node(n: Node): string {
    if (n.nodeType === Node.TEXT_NODE) {
      text += n.textContent ?? "";
      return escape(n.textContent ?? "");
    }
    if (!(n instanceof HTMLElement) || n.matches(excluded)) return "";
    const style = getComputedStyle(n);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden") return "";
    if (n.tagName === "BR") {
      text += "\n";
      return "<br>";
    }
    const inner = [...n.childNodes].map(node).join("");
    const tag = n.tagName.toLowerCase();
    if (!["strong", "em", "b", "i", "u", "a", "code", "span"].includes(tag))
      return inner;
    const id = String(inline.size);
    const href =
      tag === "a" && /^https?:/.test((n as HTMLAnchorElement).href)
        ? (n as HTMLAnchorElement).href
        : undefined;
    inline.set(id, {
      tag,
      href,
      code: tag === "code" ? (n.textContent ?? "") : undefined,
    });
    return `<${["a", "code"].includes(tag) ? "span" : tag} data-ft-id="${id}">${inner}</${["a", "code"].includes(tag) ? "span" : tag}>`;
  }
  const html = "<span>" + group.nodes.map(node).join("") + "</span>";
  return { text: text.trim(), html, inline };
}
const typography = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "color",
  "text-align",
  "text-indent",
  "text-transform",
  "word-spacing",
];
export function restyle(host: HTMLElement, owner: HTMLElement) {
  const source = getComputedStyle(owner);
  for (const property of typography)
    host.style.setProperty(property, source.getPropertyValue(property));
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("position", "static", "important");
  host.style.setProperty("height", "auto", "important");
  host.style.setProperty("max-height", "none", "important");
  host.style.setProperty("white-space", "pre-wrap", "important");
  host.style.setProperty("overflow-wrap", "anywhere", "important");
  host.style.setProperty("margin-block", "0.35em 0", "important");
}
export function render(
  group: Group,
  serialized: Serialized,
  result: string,
  html: boolean,
  language: string,
) {
  const layout = getComputedStyle(group.owner);
  if (["flex", "inline-flex", "grid", "inline-grid"].includes(layout.display))
    throw new Error("此布局块无法安全插入 / Unsupported layout block");
  const host = document.createElement("span");
  host.setAttribute(HOST, "");
  host.lang = language;
  host.dir = "auto";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ":host{box-sizing:border-box}a{color:inherit;text-decoration:underline}code{font-family:monospace}";
  shadow.append(style);
  let degraded = false;
  if (html) {
    const fragment = parseFragment(result);
    const seen = new Set<string>();
    const content = document.createDocumentFragment();
    function visit(n: any, parent: Node) {
      if (n.nodeName === "#text") {
        parent.appendChild(document.createTextNode(n.value));
        return;
      }
      if (!n.tagName) {
        for (const c of n.childNodes ?? []) visit(c, parent);
        return;
      }
      if (!["span", "strong", "em", "b", "i", "u", "br"].includes(n.tagName))
        throw new Error("Unexpected markup");
      const attributes = n.attrs ?? [];
      if (attributes.some((a: any) => a.name !== "data-ft-id"))
        throw new Error("Unexpected attributes");
      const id = attributes.find((a: any) => a.name === "data-ft-id")?.value;
      const original = id === undefined ? undefined : serialized.inline.get(id);
      if (id !== undefined && (!original || seen.has(id)))
        throw new Error("Invalid inline identity");
      if (id !== undefined) seen.add(id);
      const el = document.createElement(original?.tag ?? n.tagName);
      if (original?.href) {
        (el as HTMLAnchorElement).href = original.href;
        (el as HTMLAnchorElement).rel = "noopener noreferrer";
      }
      if (original?.code !== undefined) el.textContent = original.code;
      else for (const c of n.childNodes ?? []) visit(c, el);
      parent.appendChild(el);
    }
    try {
      visit(fragment, content);
      if (seen.size !== serialized.inline.size)
        throw new Error("Missing inline identity");
      shadow.append(content);
    } catch {
      degraded = true;
      const plain = (n: any): string =>
        n.nodeName === "#text"
          ? n.value
          : ["script", "style", "iframe"].includes(n.tagName)
            ? ""
            : (n.childNodes ?? []).map(plain).join("");
      shadow.append(document.createTextNode(plain(fragment)));
    }
  } else shadow.append(document.createTextNode(result));
  restyle(host, group.owner);
  group.anchor.parentNode!.insertBefore(host, group.anchor.nextSibling);
  return { host, degraded };
}
