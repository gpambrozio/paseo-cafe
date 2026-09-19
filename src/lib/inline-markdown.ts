import type { Nodes, PhrasingContent, RootContent } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import {
  hasVisibleInlineText,
  type InlineMarkdownNode,
  type InlineMarkdownTextNode,
  safeInlineHref,
} from "../../plugin/shared/inline-markdown"

/**
 * Projects the inline markdown in catalog text — descriptions, caveats —
 * onto the allowlisted model in plugin/shared/inline-markdown.ts. Runs once
 * at scan time (scripts/scan.ts), never in either client: the grammar is
 * remark's problem (the same stack src/lib/markdown.ts uses for READMEs),
 * and this file is only product policy about what survives the projection.
 *
 * Policy, mirroring the README pipeline where it has an opinion:
 * - text, strong, emphasis, inline code, and links come through;
 * - images collapse to their alt text, since no catalog surface shows one
 *   (src/lib/markdown.ts drops them from READMEs for the beacon reason);
 * - raw HTML is literal text, exactly as the README pipeline escapes it;
 * - a link keeps its label but loses its destination unless that is an
 *   absolute http(s) URL with a host or a non-empty mailto: address, so a
 *   repo-relative `../docs/x.md` or a `javascript:` URL is never an anchor;
 * - a link whose label has no visible text is dropped, never an unnamed
 *   interactive target;
 * - anything else — reference-style links, footnotes, strikethrough — is
 *   its source text, verbatim, which is what a reader would have seen before
 *   this projection existed.
 */
export function parseInlineMarkdown(markdown: string): InlineMarkdownNode[] {
  const root = processor.parse(markdown)
  const out: InlineMarkdownNode[] = []
  projectBlocks(root.children, markdown, out)
  return mergeRuns(out)
}

// URL and visible-label policy lives in the dependency-free shared model so
// the scan producer and remote-directory consumer enforce the same contract.

const processor = unified().use(remarkParse).use(remarkGfm)

type RunStyle = Pick<InlineMarkdownTextNode, "code" | "strong" | "emphasis">

/**
 * Catalog text is one paragraph of running text on every surface, so block
 * structure flattens: blocks follow each other separated by a space, a
 * fenced block is a code run, list items and table cells are just their
 * content.
 */
function projectBlocks(
  blocks: readonly RootContent[],
  source: string,
  out: InlineMarkdownNode[]
): void {
  let first = true
  for (const block of blocks) {
    const before = out.length
    switch (block.type) {
      case "paragraph":
      case "heading":
        projectInline(block.children, source, {}, out)
        break
      case "blockquote":
      case "list":
      case "listItem":
        projectBlocks(block.children, source, out)
        break
      case "table":
        projectBlocks(block.children, source, out)
        break
      case "tableRow":
        projectBlocks(block.children, source, out)
        break
      case "tableCell":
        projectInline(block.children, source, {}, out)
        break
      case "code":
        if (block.value) pushRun(out, { code: true }, block.value)
        break
      case "html":
        pushRun(out, {}, block.value)
        break
      case "thematicBreak":
      case "definition":
      case "footnoteDefinition":
      case "yaml":
        pushRun(out, {}, sourceOf(block, source))
        break
      default:
        pushRun(out, {}, sourceOf(block, source))
    }
    if (out.length === before) continue
    // One space between sibling blocks that both produced something; the
    // nesting levels each do this for their own siblings, so never twice.
    if (!first) out.splice(before, 0, { type: "text", text: " " })
    first = false
  }
}

function projectInline(
  nodes: readonly PhrasingContent[],
  source: string,
  style: RunStyle,
  out: InlineMarkdownNode[]
): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        pushRun(out, style, node.value)
        break
      case "strong":
        projectInline(node.children, source, { ...style, strong: true }, out)
        break
      case "emphasis":
        projectInline(node.children, source, { ...style, emphasis: true }, out)
        break
      case "delete":
        pushRun(out, style, sourceOf(node, source))
        break
      case "inlineCode":
        pushRun(out, { ...style, code: true }, node.value)
        break
      case "link":
        projectLink(node.url, node.children, source, style, out)
        break
      case "image":
        pushRun(out, style, node.alt ?? "")
        break
      case "break":
        pushRun(out, style, " ")
        break
      case "html":
        pushRun(out, style, node.value)
        break
      default:
        pushRun(out, style, sourceOf(node, source))
    }
  }
}

function projectLink(
  url: string,
  label: readonly PhrasingContent[],
  source: string,
  style: RunStyle,
  out: InlineMarkdownNode[]
): void {
  const href = safeInlineHref(url)
  // CommonMark forbids a link inside a link, so a label only ever projects
  // to text runs — but the type doesn't know that, hence the filter.
  const projected: InlineMarkdownNode[] = []
  projectInline(label, source, style, projected)
  const children = mergeRuns(projected).filter(
    (node): node is InlineMarkdownTextNode => node.type === "text"
  )

  const visible = children.some((child) => hasVisibleInlineText(child.text))
  if (href && visible) {
    out.push({ type: "link", href, children })
  } else {
    out.push(...children)
  }
}

function pushRun(
  out: InlineMarkdownNode[],
  style: RunStyle,
  text: string
): void {
  if (text) out.push({ type: "text", ...style, text })
}

function sourceOf(node: Nodes, source: string): string {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  return start === undefined || end === undefined
    ? ""
    : source.slice(start, end)
}

/** remark splits text at every construct boundary; readers want one run per style. */
function mergeRuns(nodes: readonly InlineMarkdownNode[]): InlineMarkdownNode[] {
  const merged: InlineMarkdownNode[] = []
  for (const node of nodes) {
    const previous = merged[merged.length - 1]
    if (
      node.type === "text" &&
      previous?.type === "text" &&
      Boolean(previous.code) === Boolean(node.code) &&
      Boolean(previous.strong) === Boolean(node.strong) &&
      Boolean(previous.emphasis) === Boolean(node.emphasis)
    ) {
      previous.text += node.text
    } else {
      merged.push(node.type === "text" ? { ...node } : node)
    }
  }
  return merged
}
