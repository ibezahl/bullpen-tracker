"use client";

import { useState } from "react";
import type {
  GameLineupEntry,
  SubstitutionType,
  Position,
  TeamSide,
  HalfInning,
} from "@/lib/scorebook/types";
import { SUBSTITUTION_TYPES, POSITIONS, POSITION_LIST } from "@/lib/scorebook/types";
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

type Props = {
  teamSide: TeamSide;
  teamName: string;
  activeLineup: GameLineupEntry[];
  benchPlayers: GameLineupEntry[];
  inning: number;
  half: HalfInning;
  onSubmit: (data: SubstitutionData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export type SubstitutionData = {
  substitutionType: SubstitutionType;
  incomingPlayerId: string | null;
  incomingPlayerName: string;
  outgoingPlayerId: string | null;
  newBattingOrder: number | null;
  newPosition: Position | null;
  notes: string | null;
};

export function SubstitutionDialog({
  teamSide,
  teamName,
  activeLineup,
  benchPlayers,
  inning,
  half,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: Props) {
  const [subType, setSubType] = useState<SubstitutionType | null>(null);
  const [incomingSource, setIncomingSource] = useState<"bench" | "new">("bench");
  const [incomingPlayerId, setIncomingPlayerId] = useState<string>("");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [outgoingPlayerId, setOutgoingPlayerId] = useState<string>("");
  const [newBattingOrder, setNewBattingOrder] = useState<string>("");
  const [newPosition, setNewPosition] = useState<string>("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (!subType) return;

    const incoming = incomingSource === "bench"
      ? benchPlayers.find((p) => p.id === incomingPlayerId)
      : null;

    const data: SubstitutionData = {
      substitutionType: subType,
      incomingPlayerId: incomingSource === "bench" ? incomingPlayerId : null,
      incomingPlayerName: incomingSource === "bench"
        ? incoming?.player_name || ""
        : newPlayerName,
      outgoingPlayerId: outgoingPlayerId || null,
      newBattingOrder: newBattingOrder ? parseInt(newBattingOrder, 10) : null,
      newPosition: newPosition as Position || null,
      notes: notes.trim() || null,
    };

    onSubmit(data);
  };

  const outgoingPlayer = activeLineup.find((p) => p.id === outgoingPlayerId);

  const canSubmit = () => {
    if (!subType) return false;

    switch (subType) {
      case "pinch_hitter":
      case "pinch_runner":
      case "defensive_replacement":
        return (
          (incomingSource === "bench" && incomingPlayerId) ||
          (incomingSource === "new" && newPlayerName.trim())
        ) && outgoingPlayerId;

      case "pitching_change":
        return (
          (incomingSource === "bench" && incomingPlayerId) ||
          (incomingSource === "new" && newPlayerName.trim())
        );

      case "position_change":
        return outgoingPlayerId && newPosition;

      case "double_switch":
        return (
          (incomingSource === "bench" && incomingPlayerId) ||
          (incomingSource === "new" && newPlayerName.trim())
        ) && outgoingPlayerId && newBattingOrder;

      default:
        return false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{teamName} Substitution</h3>
        <Badge variant="outline">
          {half === "top" ? "Top" : "Bot"} {inning}
        </Badge>
      </div>

      {/* Substitution Type */}
      <div>
        <Label>Substitution Type</Label>
        <Select value={subType || ""} onValueChange={(v) => setSubType(v as SubstitutionType)}>
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SUBSTITUTION_TYPES).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {subType && subType !== "position_change" && (
        <>
          {/* Incoming Player */}
          <div className="space-y-2">
            <Label>Player Entering</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={incomingSource === "bench" ? "default" : "outline"}
                size="sm"
                onClick={() => setIncomingSource("bench")}
              >
                From Bench
              </Button>
              <Button
                type="button"
                variant={incomingSource === "new" ? "default" : "outline"}
                size="sm"
                onClick={() => setIncomingSource("new")}
              >
                New Player
              </Button>
            </div>

            {incomingSource === "bench" ? (
              <Select value={incomingPlayerId} onValueChange={setIncomingPlayerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select player from bench" />
                </SelectTrigger>
                <SelectContent>
                  {benchPlayers.length === 0 ? (
                    <SelectItem value="" disabled>
                      No players on bench
                    </SelectItem>
                  ) : (
                    benchPlayers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.jersey_number && `#${p.jersey_number} `}
                        {p.player_name}
                        {p.defensive_position && ` (${p.defensive_position})`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Enter player name"
              />
            )}
          </div>
        </>
      )}

      {/* Outgoing Player (for most sub types) */}
      {subType && subType !== "pitching_change" && (
        <div>
          <Label>
            {subType === "position_change" ? "Player Changing Position" : "Player Leaving"}
          </Label>
          <Select value={outgoingPlayerId} onValueChange={setOutgoingPlayerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select player" />
            </SelectTrigger>
            <SelectContent>
              {activeLineup
                .filter((p) => p.batting_order !== null && p.batting_order >= 1)
                .sort((a, b) => (a.batting_order ?? 0) - (b.batting_order ?? 0))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.batting_order}. {p.player_name}
                    {p.defensive_position && ` (${p.defensive_position})`}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* New Position */}
      {subType && (subType === "defensive_replacement" || subType === "position_change" || subType === "double_switch") && (
        <div>
          <Label>New Position</Label>
          <Select value={newPosition} onValueChange={setNewPosition}>
            <SelectTrigger>
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              {POSITION_LIST.map((pos) => (
                <SelectItem key={pos} value={pos}>
                  {pos} - {POSITIONS[pos]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* New Batting Order (for double switch) */}
      {subType === "double_switch" && (
        <div>
          <Label>New Batting Order Position</Label>
          <Select value={newBattingOrder} onValueChange={setNewBattingOrder}>
            <SelectTrigger>
              <SelectValue placeholder="Select batting order" />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <SelectItem key={n} value={n.toString()}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Notes */}
      {subType && (
        <div>
          <Label>Notes (optional)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes"
          />
        </div>
      )}

      {/* Summary */}
      {subType && canSubmit() && (
        <div className="p-3 bg-gray-50 rounded-lg text-sm">
          <p className="font-medium mb-1">Summary:</p>
          {subType === "position_change" ? (
            <p>
              {outgoingPlayer?.player_name} moves to {newPosition}
            </p>
          ) : (
            <p>
              {incomingSource === "bench"
                ? benchPlayers.find((p) => p.id === incomingPlayerId)?.player_name
                : newPlayerName}{" "}
              {subType === "pitching_change" ? "enters as pitcher" : `replaces ${outgoingPlayer?.player_name}`}
              {newPosition && ` at ${newPosition}`}
            </p>
          )}
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
          disabled={!canSubmit() || isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Make Substitution"}
        </Button>
      </div>
    </div>
  );
}
