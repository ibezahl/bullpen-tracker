"use client";

import { useState } from "react";
import Link from "next/link";
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

type SessionRow = {
  id: string;
  pitcher_id: string;
  session_date: string;
  label: string | null;
  notes: string | null;
  created_at: string;
};

type SessionCardProps = {
  sessions: SessionRow[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: (date: string, label: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  loading: boolean;
  selectedPitcherId: string;
  disabled: boolean;
};

export function SessionCard({
  sessions,
  selectedSessionId,
  onSelectSession,
  onCreateSession,
  onRefresh,
  loading,
  selectedPitcherId,
  disabled,
}: SessionCardProps) {
  const [newSessionLabel, setNewSessionLabel] = useState("");
  const [newSessionDate, setNewSessionDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [sessionDateUnlocked, setSessionDateUnlocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreateSession(newSessionDate, newSessionLabel.trim());
      setNewSessionLabel("");
    } finally {
      setCreating(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // Reset date lock when session changes
  const handleSessionChange = (id: string) => {
    setSessionDateUnlocked(false);
    onSelectSession(id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="session-select" className="text-sm font-medium">
            Select session
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={!selectedPitcherId || refreshing}
            className="min-h-[36px]"
            aria-label="Refresh sessions"
          >
            {refreshing ? (
              <span className="flex items-center gap-1">
                <span className="animate-spin">⟳</span> Refreshing...
              </span>
            ) : (
              "Refresh"
            )}
          </Button>
        </div>
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={selectedSessionId ?? ""} onValueChange={handleSessionChange}>
            <SelectTrigger id="session-select" className="w-full" disabled={loading}>
              <SelectValue
                placeholder={
                  loading ? "Loading..." : sessions.length ? "Choose a session" : "No sessions yet"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.session_date}
                  {s.label ? ` — ${s.label}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="mt-3">
          {selectedSessionId ? (
            <Button asChild variant="outline" size="sm" className="min-h-[44px]">
              <Link href={`/sessions/${selectedSessionId}`}>View Session Summary</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="min-h-[44px]">
              View Session Summary
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 items-end">
          <div className="md:col-span-1">
            <Label htmlFor="session-date" className="block text-sm font-medium mb-1">
              Date
            </Label>
            <Input
              id="session-date"
              value={newSessionDate}
              onChange={(e) => setNewSessionDate(e.target.value)}
              type="date"
              disabled={Boolean(selectedSessionId) && !sessionDateUnlocked}
            />
            {selectedSessionId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 min-h-[36px]"
                onClick={() => setSessionDateUnlocked(true)}
                disabled={sessionDateUnlocked}
              >
                Edit date
              </Button>
            )}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="session-label" className="block text-sm font-medium mb-1">
              Label (optional)
            </Label>
            <Input
              id="session-label"
              value={newSessionLabel}
              onChange={(e) => setNewSessionLabel(e.target.value)}
              placeholder="Example: Side work, Bullpen #3"
              onKeyDown={(e) => {
                if (e.key === "Enter" && selectedPitcherId) {
                  handleCreate();
                }
              }}
            />
          </div>
          <div className="md:col-span-3">
            <Button
              onClick={handleCreate}
              disabled={disabled || creating}
              className="min-h-[44px] min-w-[120px]"
            >
              {creating ? "Adding..." : "Add session"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
