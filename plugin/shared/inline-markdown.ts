/**
 * A tiny inline-markdown reader for catalog text that authors write as
 * markdown but both clients used to print verbatim — most visibly plugin
 * descriptions, which routinely contain `[Paseo](https://paseo.sh)`,
 * `**bold**`, and `` `code` ``.
 *
 * Shared by the paseo.cafe website (src/components/inline-markdown.tsx) and
 * this Paseo plugin (../client/InlineMarkdown.tsx): the two can't share JSX,
 * so they share the parse instead and each renders the same nodes with its
 * own primitives. Like ./catalog.ts it stays free of React, the Paseo SDK,
 * Zod, DOM globals, and Node APIs.
 *
 * Deliberately only the *inline* subset — no block structure (headings,
 * lists, fences), because every surface that renders these nodes is a
 * single paragraph of running text. READMEs keep going through the full
 * remark pipeline in src/lib/markdown.ts.
 *
 * It is not a CommonMark implementation and doesn't try to be: where this
 * reader can't make sense of a construct it leaves the source text alone
 * rather than guessing, which is the failure mode readers can live with.
 */

export interface InlineMarkdownTextNode {
  type: "text"
  /** The visible text, with markdown syntax already removed. */
  text: string
  code?: boolean
  strong?: boolean
  emphasis?: boolean
}

/**
 * One link, however many styled runs its label holds — so a renderer emits
 * a single anchor (or a single press target) per link rather than one per
 * run, which would multiply tab stops and screen-reader announcements.
 */
export interface InlineMarkdownLinkNode {
  type: "link"
  href: string
  children: InlineMarkdownTextNode[]
}

export type InlineMarkdownNode = InlineMarkdownTextNode | InlineMarkdownLinkNode

/**
 * Only absolute web and mail destinations become links. Authors write
 * repo-relative links (`[checks](../../docs/verification.md)`) that mean
 * nothing off their repo, and `javascript:`/`data:` URLs are an XSS vector
 * on the website — both render as plain label text instead. This mirrors
 * the README policy in src/lib/sanitize-readme-html.ts.
 */
const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!<>|~]/

type TextStyle = Omit<InlineMarkdownTextNode, "type" | "text">

/** Parses the inline subset of markdown into renderer-neutral nodes. */
export function parseInlineMarkdown(source: string): InlineMarkdownNode[] {
  const nodes: InlineMarkdownNode[] = []
  readInline(source, {}, nodes, false)
  return nodes
}

/** The same text with all inline markdown syntax removed. */
export function inlineMarkdownToPlainText(source: string): string {
  return nodesToPlainText(parseInlineMarkdown(source))
}

function nodesToPlainText(nodes: readonly InlineMarkdownNode[]): string {
  return nodes
    .map((node) =>
      node.type === "link" ? nodesToPlainText(node.children) : node.text
    )
    .join("")
}

/**
 * `insideLink` marks the parse of a link label: links can't nest, so there
 * `[…](…)` and `<https://…>` stay text and the caller is guaranteed only
 * text nodes back.
 */
function readInline(
  source: string,
  style: TextStyle,
  out: InlineMarkdownNode[],
  insideLink: boolean
): void {
  let plain = ""
  let index = 0

  const flush = () => {
    if (plain) {
      out.push({ type: "text", ...style, text: plain })
      plain = ""
    }
  }

  while (index < source.length) {
    const char = source[index]

    if (char === "\\" && ESCAPABLE.test(source[index + 1] ?? "")) {
      plain += source[index + 1]
      index += 2
      continue
    }

    const token =
      char === "`"
        ? readCode(source, index, style)
        : char === "["
          ? readLink(source, index, style, { insideLink })
          : char === "!" && source[index + 1] === "["
            ? readLink(source, index + 1, style, { insideLink, image: true })
            : char === "<"
              ? readAutolink(source, index, style, insideLink)
              : char === "*" || char === "_"
                ? readEmphasis(source, index, style, insideLink)
                : undefined

    if (!token) {
      plain += char
      index += 1
      continue
    }

    flush()
    out.push(...token.nodes)
    index = token.end
  }

  flush()
}

interface Token {
  nodes: InlineMarkdownNode[]
  /** Index just past the syntax this token consumed. */
  end: number
}

/** A code span: one or more backticks, closed by a run of the same length. */
function readCode(
  source: string,
  start: number,
  style: TextStyle
): Token | undefined {
  const fence = runLength(source, start, "`")
  // Backslash escapes don't apply inside code spans, so a `\` never hides
  // the closing backtick: `` `\` `` is a span holding one backslash.
  const closing = findRun(source, start + fence, "`", fence, false)
  if (closing === -1) return undefined

  // CommonMark strips one space of padding from `` `a` ``-style spans.
  const raw = source.slice(start + fence, closing)
  const text =
    raw.length > 2 && raw.startsWith(" ") && raw.endsWith(" ")
      ? raw.slice(1, -1)
      : raw
  if (!text) return undefined

  return {
    nodes: [{ type: "text", ...style, code: true, text }],
    end: closing + fence,
  }
}

/**
 * An inline link: `[label](destination "optional title")`. With
 * `image: true` the same shape is an `![alt](src)` image, and only its alt
 * text survives — these surfaces show no images, for the same
 * remote-beacon reason src/lib/markdown.ts drops them from READMEs. An
 * image inside a link label (the badge-in-link README idiom) is therefore
 * just the badge's alt text.
 */
function readLink(
  source: string,
  start: number,
  style: TextStyle,
  options: { insideLink: boolean; image?: boolean }
): Token | undefined {
  if (options.insideLink && !options.image) return undefined

  const labelEnd = findClosing(source, start, "[", "]")
  if (labelEnd === -1 || source[labelEnd + 1] !== "(") return undefined

  const destinationEnd = findClosing(source, labelEnd + 1, "(", ")")
  if (destinationEnd === -1) return undefined

  const end = destinationEnd + 1
  const label = source.slice(start + 1, labelEnd)
  // An image with no alt text leaves nothing behind; an empty link label
  // would leave nothing to click, so it stays literal.
  if (!label) return options.image ? { nodes: [], end } : undefined

  const children = readLinkLabel(label, style)
  // A label that parses to nothing — `[![](badge.svg)](https://ci.example)`,
  // the unlabelled badge link — would otherwise become an empty anchor: an
  // invisible target that a screen reader announces as a nameless link.
  if (children.length === 0) return { nodes: [], end }

  const href = options.image
    ? undefined
    : readDestination(source.slice(labelEnd + 2, destinationEnd))

  // An unsafe or relative destination still shows its label, just not as a link.
  return { nodes: href ? [{ type: "link", href, children }] : children, end }
}

function readLinkLabel(
  label: string,
  style: TextStyle
): InlineMarkdownTextNode[] {
  const nodes: InlineMarkdownNode[] = []
  readInline(label, style, nodes, true)
  // readInline's `insideLink` suppresses every node type but text.
  return nodes.filter((node): node is InlineMarkdownTextNode => {
    return node.type === "text"
  })
}

/** An autolink: `<https://paseo.sh>`. */
function readAutolink(
  source: string,
  start: number,
  style: TextStyle,
  insideLink: boolean
): Token | undefined {
  const end = source.indexOf(">", start + 1)
  if (end === -1) return undefined

  const url = source.slice(start + 1, end)
  if (/\s/.test(url) || !SAFE_HREF.test(url)) return undefined

  const text: InlineMarkdownTextNode = { type: "text", ...style, text: url }
  return {
    nodes: [insideLink ? text : { type: "link", href: url, children: [text] }],
    end: end + 1,
  }
}

/**
 * `*emphasis*`, `**strong**`, `***both***` and their `_` spellings: the
 * delimiter run's length decides, so an odd run emphasizes and a run of two
 * or more bolds.
 */
function readEmphasis(
  source: string,
  start: number,
  style: TextStyle,
  insideLink: boolean
): Token | undefined {
  const marker = source[start] as "*" | "_"
  const open = runLength(source, start, marker)

  // An opening run never hugs the whitespace it would emphasize away.
  if (isBlank(source[start + open])) return undefined
  // `snake_case` identifiers are not emphasis; `*` has no such intraword use.
  if (marker === "_" && isWord(source[start - 1])) return undefined

  const closing = findEmphasisClose(source, start + open, marker, open)
  if (closing === -1) return undefined

  const nodes: InlineMarkdownNode[] = []
  readInline(
    source.slice(start + open, closing),
    {
      ...style,
      ...(open >= 2 ? { strong: true } : {}),
      ...(open % 2 === 1 ? { emphasis: true } : {}),
    },
    nodes,
    insideLink
  )
  return { nodes, end: closing + open }
}

/**
 * Where a `length`-long delimiter run closes, or -1 when it never does —
 * in which case the source text is left as-is. Runs of the same marker
 * that open their own span are counted and skipped, so the outer `**` of
 * `**a **b** c**` pairs with the outer one rather than the first closer it
 * meets. A longer closing run only gives up `length` of its delimiters:
 * `**a***` ends the bold and leaves a literal `*`.
 */
function findEmphasisClose(
  source: string,
  from: number,
  marker: string,
  length: number
): number {
  let depth = 0
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1
      continue
    }
    if (source[index] !== marker) continue

    const run = runLength(source, index, marker)
    if (run >= length) {
      // A closing run never hugs the whitespace it would emphasize away,
      // and `_` never closes mid-word (`snake_case` again).
      const closes =
        !isBlank(source[index - 1]) &&
        !(marker === "_" && isWord(source[index + length]))
      if (closes && depth === 0) return index
      if (closes) depth -= 1
      else if (!isBlank(source[index + run])) depth += 1
    }
    index += run - 1
  }
  return -1
}

/** The URL out of a link destination, ignoring `<…>` wrapping and any title. */
function readDestination(destination: string): string | undefined {
  const trimmed = destination.trim()
  let url: string
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">")
    if (end === -1) return undefined
    url = trimmed.slice(1, end)
  } else {
    url = trimmed.split(/\s+/)[0] ?? ""
  }
  return SAFE_HREF.test(url) ? url : undefined
}

function runLength(source: string, start: number, char: string): number {
  let end = start
  while (source[end] === char) end += 1
  return end - start
}

/** Index of the next run of exactly `length` `char`s, or -1. */
function findRun(
  source: string,
  from: number,
  char: string,
  length: number,
  honorEscapes: boolean
): number {
  for (let index = from; index < source.length; index += 1) {
    if (honorEscapes && source[index] === "\\") {
      index += 1
      continue
    }
    if (source[index] !== char) continue
    const run = runLength(source, index, char)
    if (run === length) return index
    index += run - 1
  }
  return -1
}

/** Index of the `close` that balances the `open` at `from`, or -1. */
function findClosing(
  source: string,
  from: number,
  open: string,
  close: string
): number {
  let depth = 0
  for (let index = from; index < source.length; index += 1) {
    const char = source[index]
    if (char === "\\") {
      index += 1
      continue
    }
    if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function isBlank(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char)
}

function isWord(char: string | undefined): boolean {
  return char !== undefined && /[\w]/.test(char)
}
