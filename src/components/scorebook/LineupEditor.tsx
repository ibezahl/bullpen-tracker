"use client";

import { useState } from "react";
import type { GameLineupEntry, Position, TeamSide } from "@/lib/scorebook/types";
import { POSITION_LIST } from "@/lib/scorebook/types";
import { updateLineupEntry, createLineupEntry, getErrorMessage } from "@/lib/scorebook/db";
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
import { useToast } from "@/components/ui/toast";

type Props = {
  gameId: string;
  userId: string;
  teamSide: TeamSide;
  teamName: string;
  lineup: GameLineupEntry[];
  onUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LineupEditor({
  gameId,
  userId,
  teamSide,
  teamName,
  lineup,
  onUpdate,
  open,
  onOpenChange,
}: Props) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  // New player form
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNumber, setNewPlayerNumber] = useState("");
  const [newPlayerPosition, setNewPlayerPosition] = useState<Position | "">("");
  const [newPlayerBattingOrder, setNewPlayerBattingOrder] = useState("");

  const hasPitcher = lineup.some((p) => p.defensive_position === "P" && p.is_active);
  const startingLineup = lineup.filter(
    (p) => p.batting_order !== null && p.batting_order >= 1 && p.batting_order <= 9
  );

  const handleUpdatePosition = async (playerId: string, position: Position | null) => {
    setSaving(true);
    try {
      await updateLineupEntry(playerId, { defensive_position: position });
      showToast("Position updated", "success");
      onUpdate();
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) {
      showToast("Enter a player name", "warning");
      return;
    }
    if (!newPlayerPosition) {
      showToast("Select a position", "warning");
      return;
    }

    setSaving(true);
    try {
      await createLineupEntry({
        user_id: userId,
        game_id: gameId,
        team_side: teamSide,
        player_id: null,
        player_name: newPlayerName.trim(),
        jersey_number: newPlayerNumber || null,
        bats: null,
        throws: null,
        batting_order: newPlayerBattingOrder ? parseInt(newPlayerBattingOrder, 10) : null,
        defensive_position: newPlayerPosition as Position,
        entry_inning: 1,
        entry_half: "top",
        entry_batter: 1,
        is_active: true,
      });

      // Reset form
      setNewPlayerName("");
      setNewPlayerNumber("");
      setNewPlayerPosition("");
      setNewPlayerBattingOrder("");

      showToast("Player added", "success");
      onUpdate();
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Edit {teamName} Lineup</h2>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            ✕
          </Button>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-4 text-sm">
            <span className={startingLineup.length >= 9 ? "text-green-600" : "text-amber-600"}>
              Batters: {startingLineup.length}/9
            </span>
            <span className={hasPitcher ? "text-green-600" : "text-red-600 font-medium"}>
              Pitcher: {hasPitcher ? "Set" : "NOT SET"}
            </span>
          </div>

          {!hasPitcher && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              No pitcher assigned. Set one player's position to "P" or add a new pitcher below.
            </div>
          )}

          {/* Current Players */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Players</Label>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {lineup
                .filter((p) => p.is_active)
                .sort((a, b) => (a.batting_order ?? 99) - (b.batting_order ?? 99))
                .map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm"
                  >
                    <span className="w-6 text-gray-400">
                      {player.batting_order || "-"}
                    </span>
                    <span className="flex-1 truncate">{player.player_name}</span>
                    <Select
                      value={player.defensive_position || "none"}
                      onValueChange={(v) =>
                        handleUpdatePosition(player.id, v === "none" ? null : (v as Position))
                      }
                      disabled={saving}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-</SelectItem>
                        {POSITION_LIST.map((pos) => (
                          <SelectItem key={pos} value={pos}>
                            {pos}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
            </div>
          </div>

          {/* Add New Player */}
          <div className="space-y-2 pt-4 border-t">
            <Label className="text-sm font-medium">Add New Player</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Name"
                className="col-span-2"
              />
              <Input
                value={newPlayerNumber}
                onChange={(e) => setNewPlayerNumber(e.target.value)}
                placeholder="#"
              />
              <Select
                value={newPlayerPosition}
                onValueChange={(v) => setNewPlayerPosition(v as Position)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Position" />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_LIST.map((pos) => (
                    <SelectItem key={pos} value={pos}>
                      {pos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={newPlayerBattingOrder || "bench"}
                onValueChange={(v) => setNewPlayerBattingOrder(v === "bench" ? "" : v)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Bat order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bench">Bench</SelectItem>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      #{n} in order
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddPlayer} disabled={saving}>
                {saving ? "Adding..." : "Add Player"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
