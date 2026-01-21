"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonPitchList } from "@/components/ui/skeleton";
import { CheckCircle, XCircle } from "lucide-react";

type PitchRow = {
  id: string;
  user_id: string;
  pitcher_id: string;
  session_id: string;
  pitch_type: string;
  tag: string | null;
  intended_location_zone_id: string | null;
  actual_location_zone_id: string | null;
  target_x: number;
  target_y: number;
  actual_x: number;
  actual_y: number;
  dx: number;
  dy: number;
  notes: string | null;
  created_at: string;
};

type PitchListProps = {
  pitches: PitchRow[];
  allPitches: PitchRow[];
  loading: boolean;
  selectedSessionId: string | null;
  highlightPitchId: string | null;
  onHighlight: (id: string | null) => void;
  onEdit: (pitch: PitchRow) => void;
  onDelete: (id: string) => Promise<void>;
  onUndo: () => Promise<void>;
  pitchNumberById: Map<string, number>;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function PitchList({
  pitches,
  allPitches,
  loading,
  selectedSessionId,
  highlightPitchId,
  onHighlight,
  onEdit,
  onDelete,
  onUndo,
  pitchNumberById,
  currentPage,
  pageSize,
  onPageChange,
}: PitchListProps) {
  const totalPages = Math.ceil(pitches.length / pageSize);
  const startIndex = currentPage * pageSize;
  const endIndex = startIndex + pageSize;
  const visiblePitches = pitches.slice(startIndex, endIndex);

  const isOutOfZone = (pitch: PitchRow) =>
    pitch.actual_x < 0.25 || pitch.actual_x > 0.75 || pitch.actual_y < 0.25 || pitch.actual_y > 0.75;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Recent pitches</CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={onUndo}
            disabled={!allPitches.length}
            className="min-h-[36px] min-w-[80px]"
          >
            Undo last
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!selectedSessionId ? (
          <div className="text-sm text-gray-600">Select a session to see pitches.</div>
        ) : loading ? (
          <SkeletonPitchList count={5} />
        ) : !allPitches.length ? (
          <div className="text-sm text-gray-600">No pitches yet.</div>
        ) : !pitches.length ? (
          <div className="text-sm text-gray-600">No pitches match this filter.</div>
        ) : (
          <>
            <div className="divide-y rounded-lg border">
              {visiblePitches.map((p) => {
                const isHi = p.id === highlightPitchId;
                const out = isOutOfZone(p);
                const pitchNum = pitchNumberById.get(p.id);

                return (
                  <div
                    key={p.id}
                    className={`w-full px-3 py-3 text-sm flex items-center justify-between gap-3 ${
                      isHi ? "bg-gray-50" : "bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onHighlight(highlightPitchId === p.id ? null : p.id)}
                      className="flex items-center gap-3 flex-1 text-left min-h-[44px]"
                      title="Click to highlight"
                      aria-pressed={isHi}
                    >
                      <div className="font-mono text-gray-500">#{pitchNum ?? "?"}</div>
                      <div className="font-medium">{p.pitch_type}</div>
                      {p.tag && (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {p.tag}
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`flex items-center gap-1 ${
                          out ? "text-red-700 border-red-200" : "text-green-700 border-green-200"
                        }`}
                        aria-label={out ? "Out of zone" : "In zone"}
                      >
                        {out ? (
                          <>
                            <XCircle className="h-3 w-3" aria-hidden="true" />
                            <span>Out</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-3 w-3" aria-hidden="true" />
                            <span>In</span>
                          </>
                        )}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(p)}
                        type="button"
                        className="min-h-[36px] min-w-[50px]"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(p.id)}
                        type="button"
                        className="min-h-[36px] min-w-[60px]"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  Showing {startIndex + 1}-{Math.min(endIndex, pitches.length)} of {pitches.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 0}
                    className="min-h-[36px]"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                    className="min-h-[36px]"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-2 text-xs text-gray-500">Click a row to highlight that pitch.</div>
      </CardContent>
    </Card>
  );
}
