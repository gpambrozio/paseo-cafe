import { describe, expect, it } from "vitest"
import type { DirectoryEntry, InstalledPlugin } from "../shared/directory"
import { directoryEntrySchema } from "../shared/directory"
import { dateBadgeForSortMode, sortEntries } from "./sort"

const NO_INSTALLATIONS = new Map<string, readonly InstalledPlugin[]>()
const NPM_VERSION = "1.0.0"
const NPM_INTEGRITY = `sha512-${"a".repeat(86)}`

/** A schema-valid entry; passing npmPublishedAt makes it npm-backed. */
function entry(
  id: string,
  addedAt: string,
  npmPublishedAt?: string
): DirectoryEntry {
  return directoryEntrySchema.parse({
    id,
    name: id,
    repo: `acme/${id}`,
    url: `https://github.com/acme/${id}`,
    addedAt,
    ...(npmPublishedAt
      ? {
          package: `@acme/${id}`,
          version: NPM_VERSION,
          npm: {
            package: `@acme/${id}`,
            version: NPM_VERSION,
            integrity: NPM_INTEGRITY,
            publishedAt: npmPublishedAt,
            downloadsLast30Days: 5,
          },
          npmSecurity: {
            status: "passed",
            blockingFindings: 0,
            advisoryFindings: 0,
            version: NPM_VERSION,
            integrity: NPM_INTEGRITY,
          },
        }
      : {}),
  })
}

// One npm entry listed long ago but released yesterday, against Git entries
// listed recently: the case where the two date sorts must disagree.
const MIXED = [
  entry("npm-old-listing", "2026-01-01T00:00:00Z", "2026-09-20T00:00:00Z"),
  entry("git-listed-today", "2026-09-21T00:00:00Z"),
  entry("git-listed-last-year", "2025-09-01T00:00:00Z"),
]

describe("directory sort modes", () => {
  // Strictly the catalog's listing date, ignoring npm release dates and the
  // npm-first grouping every other sort applies. Mirrors the website's
  // "added" sort — see src/lib/catalog-search.test.ts.
  it("lets a newer Git listing outrank an older npm one under 'recently-added'", () => {
    expect(
      sortEntries(MIXED, "recently-added", NO_INSTALLATIONS).map((e) => e.id)
    ).toEqual(["git-listed-today", "npm-old-listing", "git-listed-last-year"])
  })

  it("keeps npm releases ahead of Git listings under 'recent'", () => {
    expect(
      sortEntries(MIXED, "recent", NO_INSTALLATIONS).map((e) => e.id)
    ).toEqual(["npm-old-listing", "git-listed-today", "git-listed-last-year"])
  })

  it("sorts an unknown listing date last rather than first", () => {
    const entries = [
      entry("unknown", "whenever"),
      entry("listed", "2026-05-05T00:00:00Z"),
    ]

    expect(
      sortEntries(entries, "recently-added", NO_INSTALLATIONS).map((e) => e.id)
    ).toEqual(["listed", "unknown"])
  })
})

describe("directory date badge", () => {
  // A row must report the date it is actually ordered by: showing an npm
  // release date under "Recently added" would explain the wrong ordering.
  it("follows the sort the list is ordered by", () => {
    expect(dateBadgeForSortMode("recent")).toBe("recency")
    expect(dateBadgeForSortMode("recently-added")).toBe("added")
  })

  it("shows no date for sorts that are not ordered by one", () => {
    expect(dateBadgeForSortMode("popular")).toBeUndefined()
    expect(dateBadgeForSortMode("updates-first")).toBeUndefined()
    expect(dateBadgeForSortMode("a-z")).toBeUndefined()
  })
})
