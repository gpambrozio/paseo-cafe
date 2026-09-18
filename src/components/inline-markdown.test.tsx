/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { InlineMarkdown } from "@/components/inline-markdown"

afterEach(cleanup)

describe("InlineMarkdown", () => {
  it("renders a markdown link as an anchor instead of its syntax", () => {
    render(
      <InlineMarkdown text="A [Paseo](https://paseo.sh) plugin that talks." />
    )

    const link = screen.getByRole("link", { name: "Paseo" })
    expect(link).toHaveProperty("href", "https://paseo.sh/")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noreferrer")
    expect(document.body.textContent).toBe("A Paseo plugin that talks.")
  })

  it("renders bold and code without their syntax", () => {
    render(<InlineMarkdown text="Open **9Router** with `paseo`" />)

    expect(screen.getByText("9Router").tagName).toBe("STRONG")
    expect(screen.getByText("paseo").tagName).toBe("CODE")
    expect(document.body.textContent).toBe("Open 9Router with paseo")
  })

  it('keeps link labels as plain text when links="text"', () => {
    render(
      <InlineMarkdown text="A [Paseo](https://paseo.sh) plugin." links="text" />
    )

    expect(screen.queryByRole("link")).toBeNull()
    expect(document.body.textContent).toBe("A Paseo plugin.")
  })

  it("never renders an anchor for an unsafe destination", () => {
    render(<InlineMarkdown text="[click me](javascript:alert(1))" />)

    expect(screen.queryByRole("link")).toBeNull()
    expect(document.body.textContent).toBe("click me")
  })
})
