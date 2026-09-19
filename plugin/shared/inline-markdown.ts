/**
 * The rendered form of the inline markdown authors put in catalog text —
 * plugin descriptions and registry caveats are full of
 * `[Paseo](https://paseo.sh)`, `**bold**`, and `` `code` ``.
 *
 * Nobody parses markdown at render time. The catalog scan
 * (scripts/scan.ts) runs the source through remark once, in
 * src/lib/inline-markdown.ts, and projects it onto this small allowlisted
 * model; the model is what the generated catalog and the /api/plugins
 * response carry. The paseo.cafe website
 * (src/components/inline-markdown.tsx) and this Paseo plugin
 * (../client/InlineMarkdown.tsx) then render identical nodes with their
 * own primitives, and neither ships a markdown parser. Like ./catalog.ts
 * this module stays free of React, the Paseo SDK, Zod, DOM globals, and
 * Node APIs so both sides can import it directly.
 */

export interface InlineMarkdownTextNode {
  type: "text"
  /** Visible text; markdown syntax is already gone. */
  text: string
  code?: boolean
  strong?: boolean
  emphasis?: boolean
}

/**
 * One link, however many styled runs its label holds — so a renderer emits
 * a single anchor (or a single press target) per link rather than one per
 * run, which would multiply tab stops and screen-reader announcements.
 * `href` is always an absolute `http(s)` URL with a host or a non-empty
 * `mailto:` address; the scan validated it (src/lib/inline-markdown.ts).
 */
export interface InlineMarkdownLinkNode {
  type: "link"
  href: string
  children: InlineMarkdownTextNode[]
}

export type InlineMarkdownNode = InlineMarkdownTextNode | InlineMarkdownLinkNode

/** The nodes' text with no formatting, for surfaces that can't show any. */
export function inlineMarkdownToPlainText(
  nodes: readonly InlineMarkdownNode[]
): string {
  return nodes
    .map((node) =>
      node.type === "link"
        ? inlineMarkdownToPlainText(node.children)
        : node.text
    )
    .join("")
}

/**
 * Plain text as nodes, for a catalog that predates the model — an older
 * paseo.cafe deployment, or a staging build — where only the raw string
 * exists. It renders verbatim, exactly as it did before the model existed.
 */
export function inlineMarkdownFromPlainText(
  text: string
): InlineMarkdownNode[] {
  return text ? [{ type: "text", text }] : []
}
