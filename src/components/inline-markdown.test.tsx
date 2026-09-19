/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { InlineMarkdown } from "@/components/inline-markdown"
import { parseInlineMarkdown } from "@/lib/inline-markdown"

afterEach(cleanup)

describe("InlineMarkdown", () => {
  it("renders a link node as an anchor", () => {
    render(
      <InlineMarkdown
        nodes={parseInlineMarkdown(
          "A [Paseo](https://paseo.sh) plugin that talks."
        )}
      />
    )

    const link = screen.getByRole("link", { name: "Paseo" })
    expect(link).toHaveProperty("href", "https://paseo.sh/")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noreferrer")
    expect(document.body.textContent).toBe("A Paseo plugin that talks.")
  })

  it("renders one anchor per link, however many styled runs the label holds", () => {
    render(
      <InlineMarkdown
        nodes={parseInlineMarkdown(
          "[a **bold** label](https://x.example) and [another](https://y.example)"
        )}
      />
    )

    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(2)
    expect(links[0]?.textContent).toBe("a bold label")
    expect(links[0]?.querySelector("strong")?.textContent).toBe("bold")
    expect(links[1]?.textContent).toBe("another")
  })

  it("renders bold and code runs", () => {
    render(
      <InlineMarkdown
        nodes={parseInlineMarkdown("Open **9Router** with `paseo`")}
      />
    )

    expect(screen.getByText("9Router").tagName).toBe("STRONG")
    expect(screen.getByText("paseo").tagName).toBe("CODE")
    expect(document.body.textContent).toBe("Open 9Router with paseo")
  })

  it("nests bold and italic for a run that is both", () => {
    render(
      <InlineMarkdown nodes={parseInlineMarkdown("***really important***")} />
    )

    const strong = screen.getByText("really important").closest("strong")
    expect(strong?.querySelector("em")?.textContent).toBe("really important")
  })

  it('keeps link labels as plain text when links="text"', () => {
    render(
      <InlineMarkdown
        nodes={parseInlineMarkdown("A [Paseo](https://paseo.sh) plugin.")}
        links="text"
      />
    )

    expect(screen.queryByRole("link")).toBeNull()
    expect(document.body.textContent).toBe("A Paseo plugin.")
  })

  it("renders exactly the nodes it is given, never the raw string", () => {
    render(
      <InlineMarkdown
        nodes={[{ type: "text", text: "A [Paseo](https://paseo.sh) plugin" }]}
      />
    )

    expect(screen.queryByRole("link")).toBeNull()
    expect(document.body.textContent).toBe("A [Paseo](https://paseo.sh) plugin")
  })
})
