import { PluginCard, type PluginDateBadge } from "@/components/plugin-card"
import type { PluginRecord } from "@/lib/plugin-schema"

/** Responsive grid of plugin cards, all sharing one date-badge mode. */
export function PluginGrid({
  plugins,
  dateBadge,
}: {
  plugins: PluginRecord[]
  dateBadge?: PluginDateBadge
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard key={plugin.id} plugin={plugin} dateBadge={dateBadge} />
      ))}
    </div>
  )
}
