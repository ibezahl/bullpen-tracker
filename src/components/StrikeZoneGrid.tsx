"use client";

import { useCallback, useRef } from "react";
import { buildZones5x5, type ZoneId } from "@/lib/strikeZone";

const zones = buildZones5x5();

// Human-readable zone labels for accessibility
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

type StrikeZoneGridProps = {
  value: ZoneId | null;
  onSelect: (zoneId: ZoneId) => void;
  label: string;
};

export function StrikeZoneGrid({ value, onSelect, label }: StrikeZoneGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      let newIndex = currentIndex;
      const cols = 5;
      const rows = 5;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          newIndex = currentIndex >= cols ? currentIndex - cols : currentIndex;
          break;
        case "ArrowDown":
          e.preventDefault();
          newIndex = currentIndex < (rows - 1) * cols ? currentIndex + cols : currentIndex;
          break;
        case "ArrowLeft":
          e.preventDefault();
          newIndex = currentIndex % cols !== 0 ? currentIndex - 1 : currentIndex;
          break;
        case "ArrowRight":
          e.preventDefault();
          newIndex = (currentIndex + 1) % cols !== 0 ? currentIndex + 1 : currentIndex;
          break;
        default:
          return;
      }

      if (newIndex !== currentIndex && gridRef.current) {
        const buttons = gridRef.current.querySelectorAll("button");
        const targetButton = buttons[newIndex] as HTMLButtonElement;
        if (targetButton) {
          targetButton.focus();
        }
      }
    },
    []
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium text-gray-700" id={`${label}-label`}>
        {label}
      </div>

      <div
        ref={gridRef}
        className="grid grid-cols-5 gap-2"
        role="grid"
        aria-labelledby={`${label}-label`}
      >
        {zones.map((zone, index) => {
          const isSelected = value === zone.id;
          const zoneLabel = ZONE_LABELS[zone.id] || zone.id;

          const base =
            "aspect-square w-full min-w-[44px] min-h-[44px] rounded-md border transition focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1";

          const zoneTone =
            zone.kind === "IN"
              ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 active:bg-emerald-200"
              : "bg-amber-50 border-amber-200 hover:bg-amber-100 active:bg-amber-200";

          const selected = isSelected ? "ring-2 ring-gray-900 ring-offset-1" : "";

          return (
            <button
              key={zone.id}
              type="button"
              className={`${base} ${zoneTone} ${selected}`}
              onClick={() => onSelect(zone.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              aria-pressed={isSelected}
              aria-label={`${zoneLabel}${isSelected ? " (selected)" : ""}`}
              title={zoneLabel}
              role="gridcell"
            >
              <span className="sr-only">{zoneLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-emerald-100 border border-emerald-200" aria-hidden="true" />
          In-zone
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-200" aria-hidden="true" />
          Out-of-zone
        </span>
        {value && (
          <span className="ml-auto font-medium text-gray-700">
            Selected: {ZONE_LABELS[value] || value}
          </span>
        )}
      </div>
    </div>
  );
}
