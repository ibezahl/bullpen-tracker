"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Pitcher = {
  id: string;
  name: string;
  throwing_hand: "R" | "L" | null;
  created_at: string;
};

type Hand = "R" | "L";

function toHand(value: string): Hand {
  return value === "L" ? "L" : "R";
}

type PitcherCardProps = {
  pitchers: Pitcher[];
  selectedPitcherId: string;
  onSelectPitcher: (id: string) => void;
  onCreatePitcher: (name: string, hand: Hand) => Promise<void>;
  loading: boolean;
  hydrated: boolean;
};

export function PitcherCard({
  pitchers,
  selectedPitcherId,
  onSelectPitcher,
  onCreatePitcher,
  loading,
  hydrated,
}: PitcherCardProps) {
  const [newPitcherName, setNewPitcherName] = useState("");
  const [newPitcherHand, setNewPitcherHand] = useState<Hand>("R");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newPitcherName.trim()) return;
    setCreating(true);
    try {
      await onCreatePitcher(newPitcherName.trim(), newPitcherHand);
      setNewPitcherName("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pitcher</CardTitle>
      </CardHeader>
      <CardContent>
        <Label htmlFor="pitcher-select" className="block text-sm font-medium mb-1">
          Select pitcher
        </Label>
        {loading && !hydrated ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={selectedPitcherId} onValueChange={onSelectPitcher}>
            <SelectTrigger id="pitcher-select" className="w-full" disabled={loading}>
              <SelectValue placeholder={loading && hydrated ? "Loading..." : "Choose a pitcher"} />
            </SelectTrigger>
            <SelectContent>
              {pitchers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.throwing_hand ? ` (${p.throwing_hand})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-3 items-end">
          <div className="md:col-span-2">
            <Label htmlFor="new-pitcher-name" className="block text-sm font-medium mb-1">
              Add pitcher
            </Label>
            <Input
              id="new-pitcher-name"
              value={newPitcherName}
              onChange={(e) => setNewPitcherName(e.target.value)}
              placeholder="Name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPitcherName.trim()) {
                  handleCreate();
                }
              }}
            />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor="new-pitcher-hand" className="block text-sm font-medium mb-1">
              Throws
            </Label>
            <Select value={newPitcherHand} onValueChange={(v) => setNewPitcherHand(toHand(v))}>
              <SelectTrigger id="new-pitcher-hand" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="R">R</SelectItem>
                <SelectItem value="L">L</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <Button
              onClick={handleCreate}
              disabled={creating || !newPitcherName.trim()}
              className="min-h-[44px] min-w-[100px]"
            >
              {creating ? "Adding..." : "Add pitcher"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
