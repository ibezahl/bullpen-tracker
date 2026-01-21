"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Circle, ChevronRight, Filter } from "lucide-react";
import type { PitchMarker } from "./VideoPlayer";

interface PitchReviewSidebarProps {
  markers: PitchMarker[];
  currentMarkerIndex: number | null;
  onMarkerSelect: (index: number) => void;
  onNextUntagged: () => void;
  filter: "all" | "untagged" | "tagged";
  onFilterChange: (filter: "all" | "untagged" | "tagged") => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const PITCH_TYPE_COLORS: Record<string, string> = {
  FB: "bg-red-500",
  SL: "bg-blue-500",
  CB: "bg-green-500",
  CH: "bg-yellow-500",
  CT: "bg-purple-500",
  SI: "bg-orange-500",
};

export function PitchReviewSidebar({
  markers,
  currentMarkerIndex,
  onMarkerSelect,
  onNextUntagged,
  filter,
  onFilterChange,
}: PitchReviewSidebarProps) {
  const filteredMarkers = useMemo(() => {
    return markers.map((m, idx) => ({ ...m, originalIndex: idx })).filter((m) => {
      if (filter === "untagged") return !m.tagged;
      if (filter === "tagged") return m.tagged;
      return true;
    });
  }, [markers, filter]);

  const stats = useMemo(() => {
    const total = markers.length;
    const tagged = markers.filter((m) => m.tagged).length;
    const untagged = total - tagged;
    const progress = total > 0 ? Math.round((tagged / total) * 100) : 0;
    return { total, tagged, untagged, progress };
  }, [markers]);

  const hasUntagged = stats.untagged > 0;

  return (
    <div className="flex flex-col h-full bg-white border-l">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm mb-3">Pitch Review</h3>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{stats.tagged} of {stats.total} tagged</span>
            <span>{stats.progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        </div>

        {/* Next Untagged Button */}
        {hasUntagged && (
          <Button
            size="sm"
            className="w-full mt-3"
            onClick={onNextUntagged}
          >
            Next Untagged ({stats.untagged} left)
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex border-b">
        <button
          onClick={() => onFilterChange("all")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            filter === "all"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          All ({stats.total})
        </button>
        <button
          onClick={() => onFilterChange("untagged")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            filter === "untagged"
              ? "text-orange-600 border-b-2 border-orange-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Untagged ({stats.untagged})
        </button>
        <button
          onClick={() => onFilterChange("tagged")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            filter === "tagged"
              ? "text-green-600 border-b-2 border-green-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Tagged ({stats.tagged})
        </button>
      </div>

      {/* Pitch List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredMarkers.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {filter === "untagged" ? "All pitches tagged!" : "No pitches to show"}
            </div>
          ) : (
            filteredMarkers.map((marker) => {
              const isActive = currentMarkerIndex === marker.originalIndex;
              const pitchTypeColor = marker.pitchType
                ? PITCH_TYPE_COLORS[marker.pitchType] || "bg-gray-400"
                : "bg-gray-300";

              return (
                <button
                  key={marker.id}
                  onClick={() => onMarkerSelect(marker.originalIndex)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                    isActive
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50 border border-transparent"
                  }`}
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {marker.tagged ? (
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="h-3 w-3 text-green-600" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center">
                        <Circle className="h-3 w-3 text-orange-500" />
                      </div>
                    )}
                  </div>

                  {/* Pitch info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        #{marker.originalIndex + 1}
                      </span>
                      {marker.pitchType && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded text-white ${pitchTypeColor}`}
                        >
                          {marker.pitchType}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="font-mono">{formatTimestamp(marker.timestamp)}</span>
                      {marker.label && (
                        <span className="truncate">{marker.label}</span>
                      )}
                    </div>
                  </div>

                  {/* Active indicator */}
                  {isActive && (
                    <div className="flex-shrink-0">
                      <ChevronRight className="h-4 w-4 text-blue-500" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Keyboard hints */}
      <div className="p-3 border-t bg-gray-50">
        <div className="text-xs text-gray-400 space-y-1">
          <div><kbd className="bg-gray-200 px-1 rounded text-gray-600">Alt+N</kbd> Next untagged</div>
          <div><kbd className="bg-gray-200 px-1 rounded text-gray-600">Alt+←/→</kbd> Navigate</div>
        </div>
      </div>
    </div>
  );
}
