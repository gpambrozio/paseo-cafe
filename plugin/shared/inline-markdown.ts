/**
 * A tiny inline-markdown reader for catalog text that authors write as
 * markdown but both clients used to print verbatim — most visibly plugin
 * descriptions, which routinely contain `[Paseo](https://paseo.sh)`,
 * `**bold**`, and `` `code` ``.
 *
 * Shared by the paseo.cafe website (src/components/inline-markdown.tsx) and
 * this Paseo plugin (../client/InlineMarkdown.tsx): the two can't share JSX,
 * so they share the parse instead and each renders the same segments with
 * its own primitives. Like ./catalog.ts it stays free of React, the Paseo
 * SDK, Zod, DOM globals, and Node APIs.
 *
 * Deliberately only the *inline* subset — no block structure (headings,
 * lists, fences), because every surface that renders these segments is a
 * single paragraph of running text. READMEs keep going through the full
 * remark pipeline in src/lib/markdown.ts.
 */

export interface InlineMarkdownSegment {
  /** The visible text, with markdown syntax already removed. */
  text: string
  /** Present only for a link with a safe absolute destination. */
  href?: string
  code?: boolean
  strong?: boolean
  emphasis?: boolean
}

/**
 * Only absolute web and mail destinations become links. Authors write
 * repo-relative links (`[checks](../../docs/verification.md)`) that mean
 * nothing off their repo, and `javascript:`/`data:` URLs are an XSS vector
 * on the website — both render as plain label text instead. This mirrors
 * the README policy in src/lib/sanitize-readme-html.ts.
 */
const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!<>|~]/

type SegmentStyle = Pick<
  InlineMarkdownSegment,
  "code" | "strong" | "emphasis" | "href"
>

/** Parses the inline subset of markdown into flat, renderer-neutral segments. */
export function parseInlineMarkdown(source: string): InlineMarkdownSegment[] {
  const segments: InlineMarkdownSegment[] = []
  readInline(source, {}, segments)
  return segments
}

/** The same text with all inline markdown syntax removed. */
export function inlineMarkdownToPlainText(source: string): string {
  return parseInlineMarkdown(source)
    .map((segment) => segment.text)
    .join("")
}

function readInline(
  source: string,
  style: SegmentStyle,
  out: InlineMarkdownSegment[]
): void {
  let plain = ""
  let index = 0

  const flush = () => {
    if (plain) {
      out.push({ ...style, text: plain })
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
          ? readLink(source, index, style)
          : char === "!" && source[index + 1] === "["
            ? readLink(source, index + 1, style, { image: true })
            : char === "<"
              ? readAutolink(source, index, style)
              : char === "*" || char === "_"
                ? readEmphasis(source, index, style)
                : undefined

    if (!token) {
      plain += char
      index += 1
      continue
    }

    flush()
    out.push(...token.segments)
    index = token.end
  }

  flush()
}

interface Token {
  segments: InlineMarkdownSegment[]
  /** Index just past the token's closing syntax. */
  end: number
}

/** A code span: one or more backticks, closed by a run of the same length. */
function readCode(
  source: string,
  start: number,
  style: SegmentStyle
): Token | undefined {
  const fence = runLength(source, start, "`")
  const closing = findRun(source, start + fence, "`", fence)
  if (closing === -1) return undefined

  // CommonMark strips one space of padding from `` `a` ``-style spans.
  const raw = source.slice(start + fence, closing)
  const text =
    raw.length > 2 && raw.startsWith(" ") && raw.endsWith(" ")
      ? raw.slice(1, -1)
      : raw
  if (!text) return undefined

  return {
    segments: [{ ...style, code: true, text }],
    end: closing + fence,
  }
}

/**
 * An inline link: `[label](destination "optional title")`. With
 * `image: true` the same shape is an `![alt](src)` image, and only its alt
 * text survives — these surfaces show no images, for the same
 * remote-beacon reason src/lib/markdown.ts drops them from READMEs.
 */
function readLink(
  source: string,
  start: number,
  style: SegmentStyle,
  options: { image?: boolean } = {}
): Token | undefined {
  if (style.href) return undefined

  const labelEnd = findClosing(source, start, "[", "]")
  if (labelEnd === -1 || source[labelEnd + 1] !== "(") return undefined

  const destinationEnd = findClosing(source, labelEnd + 1, "(", ")")
  if (destinationEnd === -1) return undefined

  const label = source.slice(start + 1, labelEnd)
  // An image with no alt text leaves nothing behind; an empty link label
  // would leave nothing to click, so it stays literal.
  if (!label) {
    return options.image ? { segments: [], end: destinationEnd + 1 } : undefined
  }

  const href = options.image
    ? undefined
    : readDestination(source.slice(labelEnd + 2, destinationEnd))
  const segments: InlineMarkdownSegment[] = []
  // An unsafe or relative destination still shows its label, just not as a link.
  readInline(label, href ? { ...style, href } : style, segments)

  return { segments, end: destinationEnd + 1 }
}

/** An autolink: `<https://paseo.sh>`. */
function readAutolink(
  source: string,
  start: number,
  style: SegmentStyle
): Token | undefined {
  if (style.href) return undefined

  const end = source.indexOf(">", start + 1)
  if (end === -1) return undefined

  const url = source.slice(start + 1, end)
  if (/\s/.test(url) || !SAFE_HREF.test(url)) return undefined

  return { segments: [{ ...style, href: url, text: url }], end: end + 1 }
}

/** `**strong**` / `__strong__` and `*emphasis*` / `_emphasis_`. */
function readEmphasis(
  source: string,
  start: number,
  style: SegmentStyle
): Token | undefined {
  const marker = source[start] as "*" | "_"
  const run = Math.min(runLength(source, start, marker), 2)
  const strong = run === 2

  if (strong ? style.strong : style.emphasis) return undefined
  // An opening run never hugs the whitespace it would emphasize away.
  if (isBlank(source[start + run])) return undefined
  // `snake_case` identifiers are not emphasis; `*` has no such intraword use.
  if (marker === "_" && isWord(source[start - 1])) return undefined

  let cursor = start + run
  while (cursor < source.length) {
    const closing = findRun(source, cursor, marker, run)
    if (closing === -1) return undefined
    if (
      !isBlank(source[closing - 1]) &&
      !(marker === "_" && isWord(source[closing + run]))
    ) {
      const segments: InlineMarkdownSegment[] = []
      const nested = strong
        ? { ...style, strong: true }
        : { ...style, emphasis: true }
      readInline(source.slice(start + run, closing), nested, segments)
      return { segments, end: closing + run }
    }
    cursor = closing + run
  }
  return undefined
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
  length: number
): number {
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === "\\") {
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
