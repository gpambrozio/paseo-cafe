import type {
  DirectoryBrowseSettings,
  DirectoryEntry,
  InstalledPlugin,
} from "../shared/directory"
import {
  compareDirectoryAddedAt,
  compareDirectoryPopularity,
  compareDirectoryRecency,
  compareDirectorySource,
} from "../shared/directory"
import type { PluginRowDateBadge } from "./PluginRow"

/**
 * Ordering for the directory list, kept out of DirectorySurface.tsx so it can
 * be tested without mocking React Native and the Paseo SDK.
 */

export type SortMode = DirectoryBrowseSettings["sort"]

/** Trimmed and lowercased so ordering ignores casing and stray whitespace. */
function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ""
}

/**
 * Plain lexicographic comparison, with a missing value ordering as empty.
 * Deliberately not Intl.Collator: see the note in compareEntries about how
 * this differs from the website.
 */
function compareText(a: string | undefined, b: string | undefined): number {
  const left = normalizeText(a)
  const right = normalizeText(b)
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** Whether any installation of this entry is waiting on a newer version. */
function entryHasUpdate(
  entry: DirectoryEntry,
  installationByEntryId: ReadonlyMap<string, readonly InstalledPlugin[]>
): boolean {
  return (
    installationByEntryId
      .get(entry.id)
      ?.some((installation) => installation.updateState === "available") ??
    false
  )
}

/**
 * Last-resort ordering shared by every sort mode, so entries whose sort key
 * ties still land in a stable, repeatable order instead of shuffling between
 * renders. `repo` separates same-named plugins from different owners.
 */
function compareIdentity(a: DirectoryEntry, b: DirectoryEntry): number {
  return (
    compareText(a.name, b.name) ||
    compareText(a.repo, b.repo) ||
    compareText(a.id, b.id)
  )
}

/**
 * Which date the list is ordered by, so a row can report the date it is
 * actually sorted on rather than whichever one it happens to have.
 */
export function dateBadgeForSortMode(
  sortMode: SortMode
): PluginRowDateBadge | undefined {
  if (sortMode === "recent") return "recency"
  if (sortMode === "recently-added") return "added"
  return undefined
}

/**
 * Orders two entries for one sort mode. Every mode except "recently-added"
 * sits behind compareDirectorySource, which groups npm-backed entries ahead
 * of Git-only ones before any other key is considered.
 */
function compareEntries(
  a: DirectoryEntry,
  b: DirectoryEntry,
  sortMode: SortMode,
  installationByEntryId: ReadonlyMap<string, readonly InstalledPlugin[]>
): number {
  // Ahead of the source partition below, and tie-broken by identity rather
  // than popularity, to follow the website's "added" sort: ordering by
  // listing date only means anything if a Git-only plugin listed today can
  // outrank an older npm one.
  //
  // The primary key matches the website exactly. The tie-break does not: the
  // website compares names with Intl.Collator (numeric, base sensitivity),
  // this compares them raw, and only this side falls back to `repo`. Entries
  // sharing an addedAt are common — a bulk registry commit lists many plugins
  // at one timestamp — so a whole run of rows can rest on that difference.
  if (sortMode === "recently-added") {
    return compareDirectoryAddedAt(a, b) || compareIdentity(a, b)
  }

  const source = compareDirectorySource(a, b)
  if (source !== 0) return source

  if (sortMode === "updates-first") {
    return (
      Number(entryHasUpdate(b, installationByEntryId)) -
        Number(entryHasUpdate(a, installationByEntryId)) ||
      compareDirectoryPopularity(a, b) ||
      compareIdentity(a, b)
    )
  }

  if (sortMode === "popular") {
    return compareDirectoryPopularity(a, b) || compareIdentity(a, b)
  }

  if (sortMode === "recent") {
    return (
      compareDirectoryRecency(a, b) ||
      compareDirectoryPopularity(a, b) ||
      compareIdentity(a, b)
    )
  }

  return compareIdentity(a, b)
}

/** Returns a sorted copy; the input array is left untouched. */
export function sortEntries(
  entries: readonly DirectoryEntry[],
  sortMode: SortMode,
  installationByEntryId: ReadonlyMap<string, readonly InstalledPlugin[]>
): DirectoryEntry[] {
  return [...entries].sort((a, b) =>
    compareEntries(a, b, sortMode, installationByEntryId)
  )
}
