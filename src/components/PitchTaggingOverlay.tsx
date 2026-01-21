"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, ChevronLeft, ChevronRight, Check, Trash2 } from "lucide-react";
import { StrikeZoneGrid } from "@/components/StrikeZoneGrid";

const PITCH_TYPES = [
  { code: "FB", label: "Fastball", color: "bg-red-500" },
  { code: "SL", label: "Slider", color: "bg-blue-500" },
  { code: "CB", label: "Curveball", color: "bg-green-500" },
  { code: "CH", label: "Changeup", color: "bg-yellow-500" },
  { code: "CT", label: "Cutter", color: "bg-purple-500" },
  { code: "SI", label: "Sinker", color: "bg-orange-500" },
];

const TAGS = [
  { value: "good feel", label: "Good Feel", color: "bg-green-100 text-green-800" },
  { value: "miss up", label: "Miss Up", color: "bg-red-100 text-red-800" },
  { value: "miss arm-side", label: "Miss Arm-Side", color: "bg-orange-100 text-orange-800" },
  { value: "hung", label: "Hung", color: "bg-red-100 text-red-800" },
  { value: "sharp", label: "Sharp", color: "bg-blue-100 text-blue-800" },
  { value: "flat", label: "Flat", color: "bg-gray-100 text-gray-800" },
];

export interface PitchData {
  id?: string;
  timestamp: number;
  pitch_type: string | null;
  tag: string | null;
  intended_location_zone_id: string | null;
  actual_location_zone_id: string | null;
  target_x: number | null;
  target_y: number | null;
  actual_x: number | null;
  actual_y: number | null;
  notes: string | null;
}

interface PitchTaggingOverlayProps {
  pitch: PitchData;
  pitchNumber: number;
  totalPitches: number;
  onSave: (data: PitchData) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onNextUntagged?: () => void;
  hasUntaggedPitches?: boolean;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function PitchTaggingOverlay({
  pitch,
  pitchNumber,
  totalPitches,
  onSave,
  onDelete,
  onClose,
  onPrevious,
  onNext,
  onNextUntagged,
  hasUntaggedPitches = false,
}: PitchTaggingOverlayProps) {
  const [pitchType, setPitchType] = useState<string | null>(pitch.pitch_type);
  const [tag, setTag] = useState<string | null>(pitch.tag);
  const [intendedZone, setIntendedZone] = useState<string | null>(pitch.intended_location_zone_id);
  const [actualZone, setActualZone] = useState<string | null>(pitch.actual_location_zone_id);
  const [notes, setNotes] = useState<string>(pitch.notes || "");
  const [selectionMode, setSelectionMode] = useState<"intended" | "actual">("intended");

  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset form when pitch changes
  useEffect(() => {
    setPitchType(pitch.pitch_type);
    setTag(pitch.tag);
    setIntendedZone(pitch.intended_location_zone_id);
    setActualZone(pitch.actual_location_zone_id);
    setNotes(pitch.notes || "");
    setSelectionMode("intended");
  }, [pitch]);

  // Handle zone selection from StrikeZoneGrid
  const handleZoneSelect = useCallback(
    (zoneId: string, x: number, y: number) => {
      if (selectionMode === "intended") {
        setIntendedZone(zoneId);
        // Auto-switch to actual after selecting intended
        setSelectionMode("actual");
      } else {
        setActualZone(zoneId);
      }
    },
    [selectionMode]
  );

  // Handle save
  const handleSave = useCallback(() => {
    const updatedPitch: PitchData = {
      ...pitch,
      pitch_type: pitchType,
      tag,
      intended_location_zone_id: intendedZone,
      actual_location_zone_id: actualZone,
      notes: notes || null,
    };
    onSave(updatedPitch);
  }, [pitch, pitchType, tag, intendedZone, actualZone, notes, onSave]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (pitch.id && onDelete) {
      if (window.confirm("Are you sure you want to delete this pitch marker?")) {
        onDelete(pitch.id);
      }
    }
  }, [pitch.id, onDelete]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with note input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "Enter":
          if (e.metaKey || e.ctrlKey) {
            handleSave();
          }
          break;
        case "ArrowLeft":
          if (e.altKey && onPrevious) {
            e.preventDefault();
            onPrevious();
          }
          break;
        case "ArrowRight":
          if (e.altKey && onNext) {
            e.preventDefault();
            onNext();
          }
          break;
        case "n":
          if (e.altKey && onNextUntagged && hasUntaggedPitches) {
            e.preventDefault();
            onNextUntagged();
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            const idx = parseInt(e.key) - 1;
            if (PITCH_TYPES[idx]) {
              setPitchType(PITCH_TYPES[idx].code);
            }
          }
          break;
        case "i":
          setSelectionMode("intended");
          break;
        case "a":
          setSelectionMode("actual");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, handleSave, onPrevious, onNext, onNextUntagged, hasUntaggedPitches]);

  const isTagged = pitchType && intendedZone && actualZone;

  return (
    <div
      ref={overlayRef}
      className="bg-white rounded-lg shadow-xl border overflow-hidden max-h-[90vh] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold">
            Pitch {pitchNumber} of {totalPitches}
          </h3>
          <span className="text-sm text-gray-500 font-mono">
            @ {formatTimestamp(pitch.timestamp)}
          </span>
          {isTagged ? (
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Tagged</span>
          ) : (
            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">Untagged</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onPrevious && (
            <Button variant="ghost" size="icon" onClick={onPrevious} title="Previous (Alt+Left)">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {onNext && (
            <Button variant="ghost" size="icon" onClick={onNext} title="Next (Alt+Right)">
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} title="Close (Esc)">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left column: Pitch type and tags */}
          <div className="space-y-4">
            {/* Pitch Type Selection */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Pitch Type <span className="text-gray-400 text-xs">(Press 1-6)</span>
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {PITCH_TYPES.map((pt, idx) => (
                  <button
                    key={pt.code}
                    onClick={() => setPitchType(pt.code)}
                    className={`relative px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      pitchType === pt.code
                        ? `${pt.color} text-white border-transparent`
                        : "bg-white border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="absolute top-1 left-1 text-[10px] opacity-50">{idx + 1}</span>
                    {pt.code}
                    <div className="text-xs opacity-75">{pt.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Tag (Optional)</Label>
              <div className="flex flex-wrap gap-2">
                {TAGS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTag(tag === t.value ? null : t.value)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      tag === t.value
                        ? `${t.color} ring-2 ring-offset-1 ring-gray-400`
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Notes (Optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this pitch..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          {/* Right column: Strike zone */}
          <div className="space-y-4">
            {/* Selection mode toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectionMode("intended")}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  selectionMode === "intended"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span className="opacity-75 text-xs">(I)</span> Intended Location
                {intendedZone && <Check className="inline h-4 w-4 ml-1" />}
              </button>
              <button
                onClick={() => setSelectionMode("actual")}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  selectionMode === "actual"
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span className="opacity-75 text-xs">(A)</span> Actual Location
                {actualZone && <Check className="inline h-4 w-4 ml-1" />}
              </button>
            </div>

            {/* Strike Zone Grid */}
            <div className="flex justify-center">
              <div className="w-64">
                <StrikeZoneGrid
                  selectedZoneId={selectionMode === "intended" ? intendedZone : actualZone}
                  onZoneSelect={handleZoneSelect}
                  highlightColor={selectionMode === "intended" ? "blue" : "green"}
                  showBothLocations={true}
                  intendedZoneId={intendedZone}
                  actualZoneId={actualZone}
                />
              </div>
            </div>

            {/* Location summary */}
            <div className="flex justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>Intended: {intendedZone || "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Actual: {actualZone || "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
        <div className="flex items-center gap-2">
          {pitch.id && onDelete && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasUntaggedPitches && onNextUntagged && (
            <Button variant="outline" size="sm" onClick={onNextUntagged}>
              Next Untagged <span className="text-xs ml-1 opacity-50">(Alt+N)</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!pitchType}>
            <Check className="h-4 w-4 mr-1" />
            Save <span className="text-xs ml-1 opacity-50">(Cmd+Enter)</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
