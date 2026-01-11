"use client";

import { buildZones5x5, type ZoneId } from "@/lib/strikeZone";

const zones = buildZones5x5();

type StrikeZoneHeatmapProps = {
  title: string;
  counts: Record<ZoneId, number> | Map<ZoneId, number>;
  className?: string;
};

export function StrikeZoneHeatmap({ title, counts, className }: StrikeZoneHeatmapProps) {
  const values = counts instanceof Map ? Array.from(counts.values()) : Object.values(counts);
  const maxCount = values.length ? Math.max(...values) : 0;
  const containerClassName = className ? `flex flex-col gap-2 ${className}` : "flex flex-col gap-2";

  return (
    <div className={containerClassName}>
      <div className="text-sm font-medium text-gray-700">{title}</div>
      <div className="grid grid-cols-5 gap-2">
        {zones.map((zone) => {
          const count = counts instanceof Map ? counts.get(zone.id) ?? 0 : counts[zone.id] ?? 0;
          const intensity = maxCount ? count / maxCount : 0;
          const alpha = maxCount ? 0.08 + 0.65 * intensity : 0;
          const background = zone.inZone
            ? `rgba(16, 185, 129, ${alpha})`
            : `rgba(245, 158, 11, ${alpha})`;

          return (
            <div
              key={zone.id}
              className="aspect-square w-full rounded-md border border-gray-200 text-sm font-semibold text-gray-800 flex items-center justify-center"
              style={{ backgroundColor: background }}
              aria-label={`${zone.id} count ${count}`}
            >
              {count > 0 ? count : ""}
              <span className="sr-only">{zone.id} count {count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
