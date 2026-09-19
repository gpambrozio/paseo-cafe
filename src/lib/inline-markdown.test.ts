import { describe, expect, it } from "vitest"
import {
  inlineMarkdownToPlainText,
  safeInlineHref,
} from "../../plugin/shared/inline-markdown"
import { parseInlineMarkdown } from "./inline-markdown"

/** Shorthand for the text nodes that make up most expectations. */
function text(value: string, style: Record<string, true> = {}) {
  return { type: "text", ...style, text: value }
}

describe("parseInlineMarkdown", () => {
  it("turns an inline link into one link node", () => {
    expect(
      parseInlineMarkdown(
        "A [Paseo](https://paseo.sh) plugin that tells you, out loud."
      )
    ).toEqual([
      text("A "),
      { type: "link", href: "https://paseo.sh", children: [text("Paseo")] },
      text(" plugin that tells you, out loud."),
    ])
  })

  it("keeps a styled label inside a single link node", () => {
    expect(
      parseInlineMarkdown("[link with **bold** inside](https://x.example)")
    ).toEqual([
      {
        type: "link",
        href: "https://x.example",
        children: [
          text("link with "),
          text("bold", { strong: true }),
          text(" inside"),
        ],
      },
    ])
  })

  it("reads bold, italic, and code spans", () => {
    expect(parseInlineMarkdown("Open **9Router**, run `paseo` _now_")).toEqual([
      text("Open "),
      text("9Router", { strong: true }),
      text(", run "),
      text("paseo", { code: true }),
      text(" "),
      text("now", { emphasis: true }),
    ])
  })

  it("reads a triple run as both bold and italic", () => {
    expect(parseInlineMarkdown("**x** and ***y***")).toEqual([
      text("x", { strong: true }),
      text(" and "),
      text("y", { strong: true, emphasis: true }),
    ])
  })

  it("merges runs that share a style, however remark split them", () => {
    expect(parseInlineMarkdown("**a **b** c**")).toEqual([
      text("a b c", { strong: true }),
    ])
    expect(
      parseInlineMarkdown("literal \\*stars\\* and \\[brackets\\]")
    ).toEqual([text("literal *stars* and [brackets]")])
  })

  it("reduces a badge inside a link to the badge's alt text", () => {
    expect(
      parseInlineMarkdown(
        "[![badge](https://img.example/b.svg)](https://ci.example.com)"
      )
    ).toEqual([
      {
        type: "link",
        href: "https://ci.example.com",
        children: [text("badge")],
      },
    ])
  })

  it("drops a link whose label has no visible text", () => {
    expect(
      parseInlineMarkdown(
        "Build [![](https://img.example/b.svg)](https://ci.example.com) status"
      )
    ).toEqual([text("Build  status")])
    expect(parseInlineMarkdown("[ ](https://ci.example.com)")).toEqual([
      text(" "),
    ])
    expect(parseInlineMarkdown("[\u200B](https://ci.example.com)")).toEqual([
      text("\u200B"),
    ])
  })

  it("keeps the label but drops the link for repo-relative destinations", () => {
    expect(
      parseInlineMarkdown("See [final-version checks](../../docs/release.md).")
    ).toEqual([text("See final-version checks.")])
  })

  it("keeps the label but drops the link for script and data URLs", () => {
    expect(parseInlineMarkdown("[click me](javascript:alert(1))")).toEqual([
      text("click me"),
    ])
    expect(
      parseInlineMarkdown("[download](data:text/html,%3Cscript%3E)")
    ).toEqual([text("download")])
  })

  it("unescapes a destination the way remark does", () => {
    expect(parseInlineMarkdown("[a](https://x.example/a\\_b)")).toEqual([
      { type: "link", href: "https://x.example/a_b", children: [text("a")] },
    ])
  })

  it("links a bare autolink and a GFM literal URL", () => {
    expect(parseInlineMarkdown("docs at <https://paseo.sh/docs>")).toEqual([
      text("docs at "),
      {
        type: "link",
        href: "https://paseo.sh/docs",
        children: [text("https://paseo.sh/docs")],
      },
    ])
    expect(parseInlineMarkdown("see https://paseo.sh")).toEqual([
      text("see "),
      {
        type: "link",
        href: "https://paseo.sh",
        children: [text("https://paseo.sh")],
      },
    ])
  })

  it("reduces an image to its alt text", () => {
    expect(
      parseInlineMarkdown("Renders ![clip](/path.mp4) as a video player.")
    ).toEqual([text("Renders clip as a video player.")])
    expect(
      parseInlineMarkdown("Badge ![](https://img.example/badge.svg) gone")
    ).toEqual([text("Badge  gone")])
  })

  it("keeps raw HTML as literal text, like the README pipeline", () => {
    expect(
      parseInlineMarkdown("Hello <b>world</b> <script>x</script>")
    ).toEqual([text("Hello <b>world</b> <script>x</script>")])
  })

  it("keeps constructs outside the model as their source text", () => {
    expect(parseInlineMarkdown("See [the docs][ref] and ~~old~~ text")).toEqual(
      [text("See [the docs][ref] and ~~old~~ text")]
    )
    expect(parseInlineMarkdown("---")).toEqual([text("---")])
    expect(parseInlineMarkdown("[ref]: https://example.com")).toEqual([
      text("[ref]: https://example.com"),
    ])
  })

  it("does not read snake_case identifiers as emphasis", () => {
    expect(
      parseInlineMarkdown("The runtime ID is agent_link_9router.")
    ).toEqual([text("The runtime ID is agent_link_9router.")])
  })

  it("flattens block structure into one paragraph of text", () => {
    expect(
      parseInlineMarkdown("# Title\n\nFirst.\n\n- one\n- two\n\n```\ncode\n```")
    ).toEqual([text("Title First. one two "), text("code", { code: true })])
  })

  it("separates every table cell and row", () => {
    expect(parseInlineMarkdown("| a | b |\n| - | - |\n| c | d |")).toEqual([
      text("a b c d"),
    ])
  })

  it("returns nothing for empty or image-only input", () => {
    expect(parseInlineMarkdown("")).toEqual([])
    expect(parseInlineMarkdown("![](https://img.example/x.png)")).toEqual([])
  })
})

describe("safeInlineHref", () => {
  it("accepts absolute web URLs with a host and non-empty mailto addresses", () => {
    expect(safeInlineHref("https://paseo.sh/docs")).toBe(
      "https://paseo.sh/docs"
    )
    expect(safeInlineHref("http://localhost:3000")).toBe(
      "http://localhost:3000"
    )
    expect(safeInlineHref("mailto:hi@example.com")).toBe(
      "mailto:hi@example.com"
    )
  })

  it("rejects everything else", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "https://",
      "mailto:",
      "mailto:   ",
      "mailto:%20",
      "mailto:%09",
      "mailto:%00",
      "mailto:%E0%A4%A",
      "//evil.example",
      "../../docs/release.md",
      "#usage",
      "paseo.sh",
    ]) {
      expect(safeInlineHref(url), url).toBeUndefined()
    }
  })
})

describe("inlineMarkdownToPlainText", () => {
  it("strips every construct for surfaces that render none", () => {
    expect(
      inlineMarkdownToPlainText(
        parseInlineMarkdown(
          "A [Paseo](https://paseo.sh) plugin with **bold** and `code`"
        )
      )
    ).toBe("A Paseo plugin with bold and code")
  })
})
