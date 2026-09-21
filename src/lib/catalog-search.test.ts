import { describe, expect, it } from "vitest"
import {
  dateBadgeForSort,
  matchesPluginQuery,
  parseCatalogSearch,
  sortLabels,
  sortOptions,
  sortPlugins,
} from "./catalog-search"
import type { PluginRecord } from "./plugin-schema"

/** A minimal Git-only record; overrides supply whatever the case needs. */
function plugin(
  id: string,
  overrides: Partial<PluginRecord> = {}
): PluginRecord {
  return {
    id,
    repo: `acme/${id}`,
    url: `https://github.com/acme/${id}`,
    name: id,
    description: "",
    descriptionNodes: [],
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
    scannedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("sortPlugins by listing date", () => {
  it("puts the most recently listed plugin first", () => {
    const sorted = sortPlugins(
      [
        plugin("older", { addedAt: "2026-01-05T00:00:00+00:00" }),
        plugin("newest", { addedAt: "2026-09-05T00:00:00+00:00" }),
        plugin("middle", { addedAt: "2026-05-05T00:00:00+00:00" }),
      ],
      "added"
    )

    expect(sorted.map((entry) => entry.id)).toEqual([
      "newest",
      "middle",
      "older",
    ])
  })

  it("sorts plugins with no known listing date last, by name", () => {
    const sorted = sortPlugins(
      [
        plugin("unknown-b"),
        plugin("listed", { addedAt: "2020-01-01T00:00:00+00:00" }),
        plugin("unknown-a"),
      ],
      "added"
    )

    expect(sorted.map((entry) => entry.id)).toEqual([
      "listed",
      "unknown-a",
      "unknown-b",
    ])
  })

  it("ignores an unparseable date rather than ranking it highest", () => {
    const sorted = sortPlugins(
      [
        plugin("broken", { addedAt: "not-a-date" }),
        plugin("listed", { addedAt: "2026-02-02T00:00:00+00:00" }),
      ],
      "added"
    )

    expect(sorted.map((entry) => entry.id)).toEqual(["listed", "broken"])
  })

  it("offers both date sorts and retires repository-activity sorting", () => {
    expect(sortOptions).toEqual(["popular", "recent", "added", "az"])
    expect(sortLabels.recent).toBe("Recently released")
    expect(sortLabels.added).toBe("Recently added")
    expect(parseCatalogSearch({ sort: "added" }).sort).toBe("added")
    expect(parseCatalogSearch({ sort: "recent" }).sort).toBe("recent")
    expect(parseCatalogSearch({ sort: "updated" }).sort).toBe("popular")
  })
})

describe("catalog date badge", () => {
  // A card must report the date it is actually ordered by: showing an npm
  // release date under "Recently added" would explain the wrong ordering.
  it("follows the sort the results are ordered by", () => {
    expect(dateBadgeForSort("recent")).toBe("recency")
    expect(dateBadgeForSort("added")).toBe("added")
  })

  it("shows no date for sorts that are not ordered by one", () => {
    expect(dateBadgeForSort("popular")).toBeUndefined()
    expect(dateBadgeForSort("az")).toBeUndefined()
  })
})

describe("npm-first catalog sorting", () => {
  const npm = (
    id: string,
    downloadsLast30Days: number,
    publishedAt: string,
    addedAt?: string
  ) =>
    plugin(id, {
      npm: {
        package: id,
        version: "1.0.0",
        integrity: `sha512-${"a".repeat(86)}`,
        downloadsLast30Days,
        publishedAt,
      },
      ...(addedAt ? { addedAt } : {}),
    })

  it("ranks npm downloads then publication date before Git stars", () => {
    const sorted = sortPlugins(
      [
        plugin("git", {
          repoMeta: {
            stars: 10_000,
            openIssues: 0,
            defaultBranch: "main",
            pushedAt: "2026-09-01T00:00:00.000Z",
            topics: [],
            archived: false,
            license: null,
          },
        }),
        npm("older", 20, "2026-01-01T00:00:00.000Z"),
        npm("newer", 20, "2026-09-01T00:00:00.000Z"),
        npm("popular", 30, "2026-01-01T00:00:00.000Z"),
      ],
      "popular"
    )

    expect(sorted.map((entry) => entry.id)).toEqual([
      "popular",
      "newer",
      "older",
      "git",
    ])
  })

  it("treats incomplete npm metrics as Git-only ranking data", () => {
    const repoMeta = (stars: number) => ({
      stars,
      openIssues: 0,
      defaultBranch: "main",
      pushedAt: "2026-09-01T00:00:00.000Z",
      topics: [],
      archived: false,
      license: null,
    })
    const incomplete = plugin("incomplete", {
      npm: {
        package: "incomplete",
        version: "1.0.0",
        integrity: `sha512-${"a".repeat(86)}`,
        downloadsLast30Days: 1,
      },
      repoMeta: repoMeta(1),
    })

    expect(
      sortPlugins(
        [
          plugin("git", { repoMeta: repoMeta(50) }),
          incomplete,
          npm("npm", 0, "2026-01-01T00:00:00.000Z"),
        ],
        "popular"
      ).map((entry) => entry.id)
    ).toEqual(["npm", "git", "incomplete"])
  })

  it("groups npm before Git for recency and alphabetical sorting", () => {
    const entries = [
      plugin("a-git", { addedAt: "2026-09-10T00:00:00.000Z" }),
      npm("z-npm", 1, "2026-09-01T00:00:00.000Z"),
      npm("a-npm", 1, "2026-09-11T00:00:00.000Z"),
    ]

    expect(sortPlugins(entries, "recent").map((entry) => entry.id)).toEqual([
      "a-npm",
      "z-npm",
      "a-git",
    ])
    expect(sortPlugins(entries, "az").map((entry) => entry.id)).toEqual([
      "a-npm",
      "z-npm",
      "a-git",
    ])
  })

  it("lets a newer Git listing outrank an older npm one under 'added'", () => {
    // The whole point of keeping "added" separate from "recent": it answers
    // "what is new to the directory", so the npm-first grouping must not
    // apply, and an npm entry is ranked by when it was listed rather than
    // by when its release was published.
    const entries = [
      plugin("a-git", { addedAt: "2026-09-10T00:00:00.000Z" }),
      npm("z-npm", 1, "2026-09-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"),
      npm("a-npm", 1, "2026-09-11T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
    ]

    expect(sortPlugins(entries, "added").map((entry) => entry.id)).toEqual([
      "a-git",
      "z-npm",
      "a-npm",
    ])
  })
})

describe("theme search", () => {
  it("matches a contributed variant name that is absent from plugin metadata", () => {
    const entry = plugin("theme-pack", {
      themes: [
        {
          id: "mocha",
          name: "Catppuccin Mocha",
          appearance: "dark",
          colors: {
            background: "#1e1e2e",
            foreground: "#cdd6f4",
            raised: "#313244",
            control: "#45475a",
            border: "#45475a",
            accent: "#cba6f7",
            mutedForeground: "#a6adc8",
            ring: "#6c7086",
          },
        },
      ],
    })

    expect(matchesPluginQuery(entry, "mocha")).toBe(true)
  })
})
