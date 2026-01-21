"use client";

import { useMemo } from "react";
import { buildZones5x5, type ZoneId } from "@/lib/strikeZone";

const zones = buildZones5x5();

// Human-readable zone labels
const ZONE_LABELS: Record<string, string> = {
  O1: "High-Left (Out)",
  O2: "High-Left (Out)",
  O3: "High (Out)",
  O4: "High-Right (Out)",
  O5: "High-Right (Out)",
  O6: "Left (Out)",
  A1: "High-Left",
  A2: "High-Middle",
  A3: "High-Right",
  O7: "Right (Out)",
  O8: "Left (Out)",
  B1: "Middle-Left",
  B2: "Middle",
  B3: "Middle-Right",
  O9: "Right (Out)",
  O10: "Left (Out)",
  C1: "Low-Left",
  C2: "Low-Middle",
  C3: "Low-Right",
  O11: "Right (Out)",
  O12: "Low-Left (Out)",
  O13: "Low-Left (Out)",
  O14: "Low (Out)",
  O15: "Low-Right (Out)",
  O16: "Low-Right (Out)",
};

type StrikeZoneHeatmapProps = {
  title: string;
  counts: Record<ZoneId, number> | Map<ZoneId, number>;
  className?: string;
  showLegend?: boolean;
};

export function StrikeZoneHeatmap({ title, counts, className, showLegend = true }: StrikeZoneHeatmapProps) {
  const values = counts instanceof Map ? Array.from(counts.values()) : Object.values(counts);
  const maxCount = values.length ? Math.max(...values) : 0;
  const totalCount = values.reduce((sum, v) => sum + v, 0);
  const containerClassName = className ? `flex flex-col gap-2 ${className}` : "flex flex-col gap-2";

  // Calculate legend steps
  const legendSteps = useMemo(() => {
    if (maxCount === 0) return [];
    const steps = [0, Math.round(maxCount * 0.25), Math.round(maxCount * 0.5), Math.round(maxCount * 0.75), maxCount];
    return [...new Set(steps)]; // Remove duplicates for small counts
  }, [maxCount]);

  return (
    <div className={containerClassName}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        {totalCount > 0 && (
          <div className="text-xs text-gray-500">{totalCount} total</div>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {zones.map((zone) => {
          const count = counts instanceof Map ? counts.get(zone.id) ?? 0 : counts[zone.id] ?? 0;
          const intensity = maxCount ? count / maxCount : 0;
          const alpha = maxCount ? 0.08 + 0.65 * intensity : 0;
          const background = zone.inZone
            ? `rgba(16, 185, 129, ${alpha})`
            : `rgba(245, 158, 11, ${alpha})`;

          const zoneLabel = ZONE_LABELS[zone.id] || zone.id;

          return (
            <div
              key={zone.id}
              className="aspect-square w-full rounded-md border border-gray-200 text-sm font-semibold text-gray-800 flex items-center justify-center cursor-default hover:ring-2 hover:ring-gray-300 transition-shadow"
              style={{ backgroundColor: background }}
              aria-label={`${zoneLabel}: ${count} ${count === 1 ? 'pitch' : 'pitches'}`}
              title={`${zoneLabel}: ${count} ${count === 1 ? 'pitch' : 'pitches'}`}
            >
              {count > 0 ? count : ""}
              <span className="sr-only">{zoneLabel}: {count} {count === 1 ? 'pitch' : 'pitches'}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {showLegend && maxCount > 0 && (
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-500">Intensity:</span>
          <div className="flex items-center gap-1">
            {legendSteps.map((step, i) => {
              const intensity = maxCount ? step / maxCount : 0;
              const alpha = 0.08 + 0.65 * intensity;
              return (
                <div key={i} className="flex flex-col items-center">
                  <div
                    className="w-6 h-4 rounded border border-gray-200"
                    style={{ backgroundColor: `rgba(16, 185, 129, ${alpha})` }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5">{step}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <span className="h-3 w-3 rounded-sm bg-emerald-100 border border-emerald-200" />
              In-zone
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-200" />
              Out
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
