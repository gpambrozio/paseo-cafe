import { describe, expect, it } from "vitest"
import {
  inlineMarkdownToPlainText,
  parseInlineMarkdown,
} from "./inline-markdown"

describe("parseInlineMarkdown", () => {
  it("turns an inline link into a link segment", () => {
    expect(
      parseInlineMarkdown(
        "A [Paseo](https://paseo.sh) plugin that tells you, out loud."
      )
    ).toEqual([
      { text: "A " },
      { text: "Paseo", href: "https://paseo.sh" },
      { text: " plugin that tells you, out loud." },
    ])
  })

  it("reads bold, italic, and code spans", () => {
    expect(parseInlineMarkdown("Open **9Router**, run `paseo` _now_")).toEqual([
      { text: "Open " },
      { text: "9Router", strong: true },
      { text: ", run " },
      { text: "paseo", code: true },
      { text: " " },
      { text: "now", emphasis: true },
    ])
  })

  it("keeps styles when they nest inside a link label", () => {
    expect(
      parseInlineMarkdown("[`paseo-plugin-helper`](https://example.com/pkg)")
    ).toEqual([
      {
        text: "paseo-plugin-helper",
        href: "https://example.com/pkg",
        code: true,
      },
    ])
  })

  it("keeps the label but drops the link for repo-relative destinations", () => {
    expect(
      parseInlineMarkdown("See [final-version checks](../../docs/release.md).")
    ).toEqual([
      { text: "See " },
      { text: "final-version checks" },
      { text: "." },
    ])
  })

  it("keeps the label but drops the link for script URLs", () => {
    expect(parseInlineMarkdown("[click me](javascript:alert(1))")).toEqual([
      { text: "click me" },
    ])
  })

  it("links a bare autolink", () => {
    expect(parseInlineMarkdown("docs at <https://paseo.sh/docs>")).toEqual([
      { text: "docs at " },
      { text: "https://paseo.sh/docs", href: "https://paseo.sh/docs" },
    ])
  })

  it("reduces an image to its alt text", () => {
    expect(
      parseInlineMarkdown("Renders ![clip](/path.mp4) as a video player.")
    ).toEqual([
      { text: "Renders " },
      { text: "clip" },
      { text: " as a video player." },
    ])
    expect(
      parseInlineMarkdown("Badge ![](https://img.example/badge.svg) gone")
    ).toEqual([{ text: "Badge " }, { text: " gone" }])
  })

  it("leaves unmatched and escaped syntax as literal text", () => {
    expect(parseInlineMarkdown("a [b (c) *d `e")).toEqual([
      { text: "a [b (c) *d `e" },
    ])
    expect(
      parseInlineMarkdown("literal \\*stars\\* and \\[brackets\\]")
    ).toEqual([{ text: "literal *stars* and [brackets]" }])
  })

  it("does not read snake_case identifiers as emphasis", () => {
    expect(
      parseInlineMarkdown("The runtime ID is agent_link_9router.")
    ).toEqual([{ text: "The runtime ID is agent_link_9router." }])
  })

  it("does not read a dangling asterisk pair across whitespace as emphasis", () => {
    expect(parseInlineMarkdown("2 * 3 * 4")).toEqual([{ text: "2 * 3 * 4" }])
  })

  it("keeps parenthesized URLs intact", () => {
    expect(
      parseInlineMarkdown("[wiki](https://example.com/a_(b)_c) end")
    ).toEqual([
      { text: "wiki", href: "https://example.com/a_(b)_c" },
      { text: " end" },
    ])
  })

  it("returns nothing for empty input", () => {
    expect(parseInlineMarkdown("")).toEqual([])
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
