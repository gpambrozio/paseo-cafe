import { z } from "zod"
import type { PluginDateBadge } from "@/components/plugin-card"
import type { PluginRecord } from "@/lib/plugin-schema"
import {
  CATEGORY_LABELS,
  type Category,
  PLATFORMS,
  type Platform,
} from "@/lib/registry-schema"
import {
  CATALOG_ADDED_AT_LABEL,
  CATALOG_RECENCY_LABEL,
  compareCatalogAddedAt,
  compareCatalogPopularity,
  compareCatalogRecency,
  compareCatalogSource,
} from "../../plugin/shared/catalog"

/**
 * Search-param shape, defaults, parsing, and sorting shared by the homepage
 * catalog (src/routes/index.tsx) and anything that links back into it
 * (header logo, back links, pagination) or renders its filter/results UI
 * (src/components/catalog-sidebar.tsx, src/components/catalog-results.tsx).
 */

export const HOME_SEARCH_DEFAULT = {
  q: "",
  category: "",
  platform: "",
  sort: "popular",
  page: 1,
} as const

// "recent" leads with the newest npm releases; "added" ignores release dates
// and orders strictly by when the catalog accepted the listing. Unknown
// values fall back to the default below, so retired names keep resolving.
const sortValues = ["popular", "recent", "added", "az"] as const
export type SortValue = (typeof sortValues)[number]

/** Maps free-form category input onto the taxonomy, or "" when it names none. */
function normalizeCategoryFilter(category: string): Category | "" {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, "-")
  return Object.hasOwn(CATEGORY_LABELS, normalized)
    ? (normalized as Category)
    : ""
}

/** Maps free-form platform input onto the taxonomy, or "" when it names none. */
function normalizePlatformFilter(platform: string): Platform | "" {
  const normalized = platform.trim().toLowerCase()
  return (PLATFORMS as readonly string[]).includes(normalized)
    ? (normalized as Platform)
    : ""
}

export const routeSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  category: z
    .string()
    .optional()
    .catch(undefined)
    .transform((category) =>
      category === undefined ? undefined : normalizeCategoryFilter(category)
    ),
  platform: z
    .string()
    .optional()
    .catch(undefined)
    .transform((platform) =>
      platform === undefined ? undefined : normalizePlatformFilter(platform)
    ),
  sort: z.enum(sortValues).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
})

export interface CatalogSearch {
  q: string
  category: Category | ""
  platform: Platform | ""
  sort: SortValue
  page: number
}

/**
 * Resolves raw search params into a fully populated shape. Every field falls
 * back to HOME_SEARCH_DEFAULT, so a retired or malformed value degrades to
 * the default view rather than failing the route.
 */
export function parseCatalogSearch(search: unknown): CatalogSearch {
  const parsed = routeSearchSchema.parse(search)
  return {
    q: parsed.q ?? HOME_SEARCH_DEFAULT.q,
    category: parsed.category ?? HOME_SEARCH_DEFAULT.category,
    platform: parsed.platform ?? HOME_SEARCH_DEFAULT.platform,
    sort: parsed.sort ?? HOME_SEARCH_DEFAULT.sort,
    page: parsed.page ?? HOME_SEARCH_DEFAULT.page,
  }
}

/** Keeps a requested page within range once filters shrink the result set. */
export function clampCatalogPage(page: number, totalPages: number): number {
  return Math.min(page, Math.max(1, totalPages))
}

export const sortLabels: Record<SortValue, string> = {
  popular: "Popular",
  recent: CATALOG_RECENCY_LABEL,
  added: CATALOG_ADDED_AT_LABEL,
  az: "A–Z",
}

export const sortOptions: SortValue[] = ["popular", "recent", "added", "az"]

/**
 * Which date the results are ordered by, so a card can report the date it is
 * actually sorted on rather than whichever one it happens to have.
 */
export function dateBadgeForSort(sort: SortValue): PluginDateBadge | undefined {
  if (sort === "recent") return "recency"
  if (sort === "added") return "added"
  return undefined
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

/**
 * Last-resort ordering shared by every sort, so entries whose sort key ties
 * still land in a stable order. Uses Intl.Collator, which the companion does
 * not — see the note in plugin/client/sort.ts.
 */
function comparePluginsByName(a: PluginRecord, b: PluginRecord): number {
  return collator.compare(a.name, b.name) || collator.compare(a.id, b.id)
}

/**
 * Returns a sorted copy; the input array is left untouched. "popular",
 * "recent" and "az" group npm-backed plugins ahead of Git-only ones via
 * compareCatalogSource; "added" deliberately does not.
 */
export function sortPlugins(
  plugins: PluginRecord[],
  sort: SortValue
): PluginRecord[] {
  return [...plugins].sort((a, b) => {
    switch (sort) {
      case "popular":
        return compareCatalogPopularity(a, b) || comparePluginsByName(a, b)
      case "recent":
        return compareCatalogRecency(a, b) || comparePluginsByName(a, b)
      case "added":
        // Deliberately skips the compareCatalogSource partition the other
        // sorts apply: ordering by listing date only means anything if a
        // Git-only plugin listed today can outrank an older npm one.
        return compareCatalogAddedAt(a, b) || comparePluginsByName(a, b)
      case "az":
        return compareCatalogSource(a, b) || comparePluginsByName(a, b)
      default:
        return 0
    }
  })
}

/**
 * Free-text match across every field a reader might search by, including
 * contributed theme names that appear nowhere else in the plugin's metadata.
 */
export function matchesPluginQuery(
  plugin: PluginRecord,
  query: string
): boolean {
  const haystack = [
    plugin.name,
    plugin.description,
    plugin.id,
    plugin.repo,
    plugin.author,
    plugin.owner?.login,
    plugin.categories.join(" "),
    plugin.platforms.join(" "),
    plugin.caveats.join(" "),
    plugin.limitationsNotes,
    plugin.paseoVersionRequirement,
    ...(plugin.themes ?? []).map(
      ({ id, name, appearance }) => `${id} ${name} ${appearance}`
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return haystack.includes(query.toLowerCase())
}
