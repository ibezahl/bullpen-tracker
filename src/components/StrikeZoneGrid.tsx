"use client";

import { buildZones5x5, type ZoneId } from "@/lib/strikeZone";

const zones = buildZones5x5();

type StrikeZoneGridProps = {
  value: ZoneId | null;
  onSelect: (zoneId: ZoneId) => void;
  label: string;
};

export function StrikeZoneGrid({ value, onSelect, label }: StrikeZoneGridProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium text-gray-700">{label}</div>

      <div className="grid grid-cols-5 gap-2">
        {zones.map((zone) => {
          const isSelected = value === zone.id;

          const base =
            "aspect-square w-full rounded-md border transition focus:outline-none focus:ring-2 focus:ring-gray-900";

          const zoneTone =
            zone.kind === "IN"
              ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
              : "bg-amber-50 border-amber-200 hover:bg-amber-100";

          const selected = isSelected ? "ring-2 ring-gray-900" : "";

          return (
            <button
              key={zone.id}
              type="button"
              className={`${base} ${zoneTone} ${selected}`}
              onClick={() => onSelect(zone.id)}
              aria-pressed={isSelected}
            >
              <span className="sr-only">{zone.id}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-emerald-100 border border-emerald-200" />
          In-zone
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-200" />
          Out-of-zone
        </span>
      </div>
    </div>
  );
}
