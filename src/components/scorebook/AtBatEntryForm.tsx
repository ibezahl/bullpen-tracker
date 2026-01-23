"use client";

import { useState } from "react";
import type {
  AtBatResultType,
  GameLineupEntry,
  Position,
  BaseState,
} from "@/lib/scorebook/types";
import { AT_BAT_RESULTS, AT_BAT_RESULT_TYPES, POSITION_LIST } from "@/lib/scorebook/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  batter: GameLineupEntry;
  pitcher: GameLineupEntry;
  baseState: BaseState;
  outs: number;
  onSubmit: (data: AtBatEntryData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export type AtBatEntryData = {
  resultType: AtBatResultType;
  resultDetail: string | null;
  balls: number;
  strikes: number;
  pitchCount: number;
  rbis: number;
  notes: string | null;
  // Runner advancements
  runnerAdvances: {
    runnerId: string;
    fromBase: "1" | "2" | "3";
    toBase: "2" | "3" | "H" | "OUT";
    isOut: boolean;
    runScored: boolean;
  }[];
};

export function AtBatEntryForm({
  batter,
  pitcher,
  baseState,
  outs,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: Props) {
  const [resultType, setResultType] = useState<AtBatResultType | null>(null);
  const [resultDetail, setResultDetail] = useState("");
  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [rbis, setRbis] = useState(0);
  const [notes, setNotes] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Quick result buttons organized by category
  const hitResults: AtBatResultType[] = ["1B", "2B", "3B", "HR"];
  const outResults: AtBatResultType[] = ["GO", "FO", "LO", "PO", "K", "KL"];
  const otherResults: AtBatResultType[] = ["BB", "HBP", "FC", "E", "SAC", "SF", "DP"];

  const handleQuickResult = (result: AtBatResultType) => {
    setResultType(result);
    // Auto-set some defaults based on result
    if (result === "K" || result === "KL") {
      setStrikes(3);
    }
    if (result === "BB") {
      setBalls(4);
    }
  };

  const handleSubmit = () => {
    if (!resultType) return;

    const data: AtBatEntryData = {
      resultType,
      resultDetail: resultDetail.trim() || null,
      balls,
      strikes,
      pitchCount: balls + strikes, // Simplified
      rbis,
      notes: notes.trim() || null,
      runnerAdvances: [], // Will be handled separately in advanced mode
    };

    onSubmit(data);
  };

  const ResultButton = ({
    result,
    variant = "outline",
  }: {
    result: AtBatResultType;
    variant?: "outline" | "default";
  }) => (
    <Button
      type="button"
      variant={resultType === result ? "default" : variant}
      size="sm"
      onClick={() => handleQuickResult(result)}
      className="min-w-[48px]"
    >
      {result}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Current matchup */}
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-gray-500">Batting:</span>{" "}
          <span className="font-medium">{batter.player_name}</span>
          {batter.jersey_number && (
            <span className="text-gray-400 ml-1">#{batter.jersey_number}</span>
          )}
        </div>
        <div>
          <span className="text-gray-500">Pitching:</span>{" "}
          <span className="font-medium">{pitcher.player_name}</span>
        </div>
      </div>

      {/* Quick result buttons */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Result</Label>

        {/* Hits */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Hits</p>
          <div className="flex flex-wrap gap-1">
            {hitResults.map((r) => (
              <ResultButton key={r} result={r} />
            ))}
          </div>
        </div>

        {/* Outs */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Outs</p>
          <div className="flex flex-wrap gap-1">
            {outResults.map((r) => (
              <ResultButton key={r} result={r} />
            ))}
          </div>
        </div>

        {/* Other */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Other</p>
          <div className="flex flex-wrap gap-1">
            {otherResults.map((r) => (
              <ResultButton key={r} result={r} />
            ))}
          </div>
        </div>
      </div>

      {/* Selected result detail */}
      {resultType && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="default">{resultType}</Badge>
            <span className="text-sm">{AT_BAT_RESULTS[resultType].label}</span>
          </div>

          {/* Fielding notation */}
          <div className="mb-2">
            <Label htmlFor="result-detail" className="text-xs">
              Fielding notation (e.g., 6-3, F8, L7)
            </Label>
            <Input
              id="result-detail"
              value={resultDetail}
              onChange={(e) => setResultDetail(e.target.value)}
              placeholder="Optional"
              className="mt-1"
            />
          </div>

          {/* RBIs */}
          <div className="flex items-center gap-2">
            <Label htmlFor="rbis" className="text-xs">
              RBIs:
            </Label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setRbis(Math.max(0, rbis - 1))}
              >
                -
              </Button>
              <span className="w-6 text-center font-mono">{rbis}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setRbis(Math.min(4, rbis + 1))}
              >
                +
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced options toggle */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-gray-500"
      >
        {showAdvanced ? "Hide" : "Show"} advanced options
      </Button>

      {/* Advanced options */}
      {showAdvanced && (
        <div className="space-y-3 p-3 border rounded-lg">
          {/* Count */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Balls</Label>
              <div className="flex items-center gap-1 mt-1">
                {[0, 1, 2, 3, 4].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={balls === n ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setBalls(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Strikes</Label>
              <div className="flex items-center gap-1 mt-1">
                {[0, 1, 2, 3].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={strikes === n ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setStrikes(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this at-bat"
              className="mt-1 h-16"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!resultType || isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Record At-Bat"}
        </Button>
      </div>
    </div>
  );
}
