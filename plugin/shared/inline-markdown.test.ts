import { describe, expect, it } from "vitest"
import {
  inlineMarkdownToPlainText,
  parseInlineMarkdown,
} from "./inline-markdown"

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
      {
        type: "link",
        href: "https://paseo.sh",
        children: [text("Paseo")],
      },
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

  it("absorbs emphasis nested in the same style instead of leaking markers", () => {
    expect(parseInlineMarkdown("*_both_*")).toEqual([
      text("both", { emphasis: true }),
    ])
    expect(parseInlineMarkdown("**a **b** c**")).toEqual([
      text("a ", { strong: true }),
      text("b", { strong: true }),
      text(" c", { strong: true }),
    ])
  })

  it("closes a bold run against a longer one and leaves the extra marker", () => {
    expect(parseInlineMarkdown("**a***")).toEqual([
      text("a", { strong: true }),
      text("*"),
    ])
  })

  it("keeps styles when they nest inside a link label", () => {
    expect(
      parseInlineMarkdown("[`paseo-plugin-helper`](https://example.com/pkg)")
    ).toEqual([
      {
        type: "link",
        href: "https://example.com/pkg",
        children: [text("paseo-plugin-helper", { code: true })],
      },
    ])
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

  it("drops a link whose label is only an unlabelled badge", () => {
    expect(
      parseInlineMarkdown(
        "Build [![](https://img.example/b.svg)](https://ci.example.com) status"
      )
    ).toEqual([text("Build "), text(" status")])
  })

  it("flattens an autolink inside a link label, never nesting links", () => {
    expect(parseInlineMarkdown("[see <https://y.com>](https://x.com)")).toEqual(
      [
        {
          type: "link",
          href: "https://x.com",
          children: [text("see "), text("https://y.com")],
        },
      ]
    )
  })

  it("keeps the label but drops the link for repo-relative destinations", () => {
    expect(
      parseInlineMarkdown("See [final-version checks](../../docs/release.md).")
    ).toEqual([text("See "), text("final-version checks"), text(".")])
  })

  it("keeps the label but drops the link for script URLs", () => {
    expect(parseInlineMarkdown("[click me](javascript:alert(1))")).toEqual([
      text("click me"),
    ])
  })

  it("links a bare autolink", () => {
    expect(parseInlineMarkdown("docs at <https://paseo.sh/docs>")).toEqual([
      text("docs at "),
      {
        type: "link",
        href: "https://paseo.sh/docs",
        children: [text("https://paseo.sh/docs")],
      },
    ])
  })

  it("reduces an image to its alt text", () => {
    expect(
      parseInlineMarkdown("Renders ![clip](/path.mp4) as a video player.")
    ).toEqual([text("Renders "), text("clip"), text(" as a video player.")])
    expect(
      parseInlineMarkdown("Badge ![](https://img.example/badge.svg) gone")
    ).toEqual([text("Badge "), text(" gone")])
  })

  it("does not let a backslash swallow a code span's backtick", () => {
    expect(parseInlineMarkdown("Use `\\` to escape.")).toEqual([
      text("Use "),
      text("\\", { code: true }),
      text(" to escape."),
    ])
  })

  it("leaves unmatched and escaped syntax as literal text", () => {
    expect(parseInlineMarkdown("a [b (c) *d `e")).toEqual([
      text("a [b (c) *d `e"),
    ])
    expect(
      parseInlineMarkdown("literal \\*stars\\* and \\[brackets\\]")
    ).toEqual([text("literal *stars* and [brackets]")])
  })

  it("does not read snake_case identifiers as emphasis", () => {
    expect(
      parseInlineMarkdown("The runtime ID is agent_link_9router.")
    ).toEqual([text("The runtime ID is agent_link_9router.")])
  })

  it("does not read a dangling asterisk pair across whitespace as emphasis", () => {
    expect(parseInlineMarkdown("2 * 3 * 4")).toEqual([text("2 * 3 * 4")])
  })

  it("keeps parenthesized URLs intact", () => {
    expect(
      parseInlineMarkdown("[wiki](https://example.com/a_(b)_c) end")
    ).toEqual([
      {
        type: "link",
        href: "https://example.com/a_(b)_c",
        children: [text("wiki")],
      },
      text(" end"),
    ])
  })

  it("returns nothing for empty input", () => {
    expect(parseInlineMarkdown("")).toEqual([])
  })

  it("never loses the words in delimiter soup", () => {
    const inputs = [
      "*alpha **beta* gamma**",
      "``alpha `beta",
      "[alpha *beta](https://x.example",
      "<https://x.example alpha>",
      "!alpha[beta]*gamma_",
      "\\*alpha\\_beta\\`gamma",
    ]
    for (const input of inputs) {
      const words = input.match(/[a-z]+/g) ?? []
      expect(inlineMarkdownToPlainText(input).match(/[a-z]+/g) ?? []).toEqual(
        words
      )
    }
  })
})

describe("inlineMarkdownToPlainText", () => {
  it("strips syntax for surfaces that cannot render it", () => {
    expect(
      inlineMarkdownToPlainText(
        "A [Paseo](https://paseo.sh) plugin with **bold** and `code`"
      )
    ).toBe("A Paseo plugin with bold and code")
  })

  it("leaves plain text untouched", () => {
    expect(inlineMarkdownToPlainText("Just a description.")).toBe(
      "Just a description."
    )
  })
})
