/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PluginCard } from "@/components/plugin-card"
import { pluginRecordSchema } from "@/lib/plugin-schema"

// The card is wrapped in a router Link, which needs a router context this
// test has no use for.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

const INTEGRITY = `sha512-${"a".repeat(86)}`

/** An npm-backed record listed long before the release it was published. */
function npmPlugin() {
  return pluginRecordSchema.parse({
    id: "example",
    repo: "acme/example",
    package: "@acme/example",
    url: "https://github.com/acme/example",
    name: "Example",
    description: "Example plugin",
    descriptionNodes: [{ type: "text", text: "Example plugin" }],
    version: "1.2.3",
    // Listed long before the release the "Recently released" sort ranks it by.
    addedAt: "2026-01-05T00:00:00.000Z",
    npm: {
      package: "@acme/example",
      version: "1.2.3",
      integrity: INTEGRITY,
      publishedAt: "2026-09-01T00:00:00.000Z",
      downloadsLast30Days: 1_000,
    },
    npmSecurity: {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      version: "1.2.3",
      integrity: INTEGRITY,
    },
    categories: [],
    platforms: [],
    caveats: [],
    caveatNodes: [],
    health: {
      manifestValid: true,
      hasReadme: true,
      hasLicense: true,
      hasTests: true,
      hasTypecheckScript: true,
      updatedRecently: true,
    },
    images: [],
    videos: [],
    scannedAt: "2026-09-02T00:00:00.000Z",
  })
}

afterEach(cleanup)

describe("plugin card date badge", () => {
  it("shows the npm release date when ordered by recency", () => {
    render(<PluginCard plugin={npmPlugin()} dateBadge="recency" />)

    expect(screen.getByText(/Published/)).toBeDefined()
    expect(screen.queryByText(/Added/)).toBeNull()
  })

  // The card must report the date it is actually ordered by. Showing an npm
  // release date under "Recently added" would explain the wrong ordering.
  it("shows the listing date for an npm plugin when ordered by listing date", () => {
    render(<PluginCard plugin={npmPlugin()} dateBadge="added" />)

    expect(screen.getByText(/Added/)).toBeDefined()
    expect(screen.queryByText(/Published/)).toBeNull()
  })

  // Roughly half the catalog is Git-only, so the recency badge is only
  // correct if it falls back to the listing date it actually sorted them by.
  it("falls back to the listing date for a Git-only plugin under recency", () => {
    const { npm, npmSecurity, package: _pkg, ...gitOnly } = npmPlugin()
    render(
      <PluginCard
        plugin={gitOnly as ReturnType<typeof npmPlugin>}
        dateBadge="recency"
      />
    )

    expect(screen.getByText(/Added/)).toBeDefined()
    expect(screen.queryByText(/Published/)).toBeNull()
  })

  it("shows no date when the results are not ordered by one", () => {
    render(<PluginCard plugin={npmPlugin()} />)

    expect(screen.queryByText(/Added/)).toBeNull()
    expect(screen.queryByText(/Published/)).toBeNull()
  })
})
