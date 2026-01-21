"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoPlayer, type PitchMarker } from "@/components/VideoPlayer";
import { PitchTaggingOverlay, type PitchData } from "@/components/PitchTaggingOverlay";
import { PitchReviewSidebar } from "@/components/PitchReviewSidebar";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Link as LinkIcon, Video, AlertCircle } from "lucide-react";

interface SessionData {
  id: string;
  session_date: string;
  label: string | null;
  video_url: string | null;
  pitcher_id: string;
  pitchers?: {
    name: string;
    throwing_hand: string;
  } | Array<{
    name: string;
    throwing_hand: string;
  }>;
}

interface PitchRow {
  id: string;
  timestamp: number | null;
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

export default function VideoSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [currentMarkerIndex, setCurrentMarkerIndex] = useState<number | null>(null);
  const [showTaggingOverlay, setShowTaggingOverlay] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "untagged" | "tagged">("all");
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  // Load session and pitches
  useEffect(() => {
    if (!supabase || !sessionId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Get current user
        const { data: authData } = await supabase.auth.getSession();
        const uid = authData.session?.user?.id;
        setUserId(uid ?? null);

        if (!uid) {
          setLoading(false);
          return;
        }

        // Load session with pitcher info
        const { data: sessionData, error: sessionError } = await supabase
          .from("sessions")
          .select(`
            id,
            session_date,
            label,
            video_url,
            pitcher_id,
            pitchers (
              name,
              throwing_hand
            )
          `)
          .eq("id", sessionId)
          .eq("user_id", uid)
          .single();

        if (sessionError) {
          console.error("Error loading session:", sessionError);
          showToast("Failed to load session", "error");
          return;
        }

        setSession(sessionData as SessionData);

        // Load pitches with timestamps
        const { data: pitchesData, error: pitchesError } = await supabase
          .from("pitches")
          .select("*")
          .eq("session_id", sessionId)
          .eq("user_id", uid)
          .order("timestamp", { ascending: true, nullsFirst: false });

        if (pitchesError) {
          console.error("Error loading pitches:", pitchesError);
        } else {
          setPitches(pitchesData || []);
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [sessionId, showToast]);

  // Convert pitches to markers for the video player
  const markers: PitchMarker[] = useMemo(() => {
    return pitches
      .filter((p) => p.timestamp !== null)
      .map((p) => ({
        id: p.id,
        timestamp: p.timestamp!,
        pitchType: p.pitch_type ?? undefined,
        tagged: !!(p.pitch_type && p.intended_location_zone_id && p.actual_location_zone_id),
        label: p.tag ?? undefined,
      }));
  }, [pitches]);

  // Current pitch data for tagging
  const currentPitch: PitchData | null = useMemo(() => {
    if (currentMarkerIndex === null || !markers[currentMarkerIndex]) return null;
    const marker = markers[currentMarkerIndex];
    const pitch = pitches.find((p) => p.id === marker.id);
    if (!pitch) return null;

    return {
      id: pitch.id,
      timestamp: marker.timestamp,
      pitch_type: pitch.pitch_type,
      tag: pitch.tag,
      intended_location_zone_id: pitch.intended_location_zone_id,
      actual_location_zone_id: pitch.actual_location_zone_id,
      target_x: pitch.target_x,
      target_y: pitch.target_y,
      actual_x: pitch.actual_x,
      actual_y: pitch.actual_y,
      notes: pitch.notes,
    };
  }, [currentMarkerIndex, markers, pitches]);

  // Find next untagged pitch
  const findNextUntagged = useCallback(
    (fromIndex: number = -1) => {
      for (let i = fromIndex + 1; i < markers.length; i++) {
        if (!markers[i].tagged) return i;
      }
      // Wrap around
      for (let i = 0; i <= fromIndex; i++) {
        if (!markers[i].tagged) return i;
      }
      return null;
    },
    [markers]
  );

  const hasUntaggedPitches = useMemo(() => {
    return markers.some((m) => !m.tagged);
  }, [markers]);

  // Handle marking a new pitch
  const handleMarkPitch = useCallback(
    async (timestamp: number) => {
      if (!supabase || !userId || !session) return;

      try {
        const { data, error } = await supabase
          .from("pitches")
          .insert({
            user_id: userId,
            pitcher_id: session.pitcher_id,
            session_id: sessionId,
            timestamp,
            pitch_type: "Untagged",
            tag: "",
            target_x: 0,
            target_y: 0,
            actual_x: 0,
            actual_y: 0,
            dx: 0,
            dy: 0,
            notes: "",
          })
          .select()
          .single();

        if (error) throw error;

        setPitches((prev) => {
          const updated = [...prev, data as PitchRow];
          // Sort by timestamp
          updated.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
          return updated;
        });

        // Find the new pitch index and open tagging
        const newIndex = pitches.length; // Will be at the end after adding
        setTimeout(() => {
          const idx = markers.findIndex((m) => m.id === data.id);
          if (idx >= 0) {
            setCurrentMarkerIndex(idx);
            setShowTaggingOverlay(true);
          }
        }, 100);

        showToast("Pitch marked! Add details below.", "success");
      } catch (err: unknown) {
        const errorDetails = err instanceof Error ? err.message : JSON.stringify(err);
        console.error("Error marking pitch:", errorDetails, err);
        showToast(`Failed to mark pitch: ${errorDetails}`, "error");
      }
    },
    [supabase, userId, session, sessionId, pitches.length, markers, showToast]
  );

  // Handle saving pitch data
  const handleSavePitch = useCallback(
    async (data: PitchData) => {
      if (!supabase || !data.id) return;

      try {
        const { error } = await supabase
          .from("pitches")
          .update({
            pitch_type: data.pitch_type,
            tag: data.tag,
            intended_location_zone_id: data.intended_location_zone_id,
            actual_location_zone_id: data.actual_location_zone_id,
            target_x: data.target_x,
            target_y: data.target_y,
            actual_x: data.actual_x,
            actual_y: data.actual_y,
            notes: data.notes,
          })
          .eq("id", data.id);

        if (error) throw error;

        setPitches((prev) =>
          prev.map((p) =>
            p.id === data.id
              ? {
                  ...p,
                  pitch_type: data.pitch_type,
                  tag: data.tag,
                  intended_location_zone_id: data.intended_location_zone_id,
                  actual_location_zone_id: data.actual_location_zone_id,
                  target_x: data.target_x,
                  target_y: data.target_y,
                  actual_x: data.actual_x,
                  actual_y: data.actual_y,
                  notes: data.notes,
                }
              : p
          )
        );

        showToast("Pitch saved!", "success");
      } catch (err) {
        console.error("Error saving pitch:", err);
        showToast("Failed to save pitch", "error");
      }
    },
    [supabase, showToast]
  );

  // Handle deleting pitch marker
  const handleDeletePitch = useCallback(
    async (id: string) => {
      if (!supabase) return;

      try {
        const { error } = await supabase.from("pitches").delete().eq("id", id);

        if (error) throw error;

        setPitches((prev) => prev.filter((p) => p.id !== id));
        setShowTaggingOverlay(false);
        setCurrentMarkerIndex(null);

        showToast("Pitch marker deleted", "success");
      } catch (err) {
        console.error("Error deleting pitch:", err);
        showToast("Failed to delete pitch", "error");
      }
    },
    [supabase, showToast]
  );

  // Handle marker click from video player
  const handleMarkerClick = useCallback((marker: PitchMarker) => {
    const idx = markers.findIndex((m) => m.id === marker.id);
    if (idx >= 0) {
      setCurrentMarkerIndex(idx);
      setShowTaggingOverlay(true);
    }
  }, [markers]);

  // Handle marker select from sidebar
  const handleMarkerSelect = useCallback((index: number) => {
    setCurrentMarkerIndex(index);
    setShowTaggingOverlay(true);
  }, []);

  // Handle next untagged
  const handleNextUntagged = useCallback(() => {
    const nextIdx = findNextUntagged(currentMarkerIndex ?? -1);
    if (nextIdx !== null) {
      setCurrentMarkerIndex(nextIdx);
      setShowTaggingOverlay(true);
    }
  }, [findNextUntagged, currentMarkerIndex]);

  // Navigate between pitches
  const handlePrevious = useCallback(() => {
    if (currentMarkerIndex !== null && currentMarkerIndex > 0) {
      setCurrentMarkerIndex(currentMarkerIndex - 1);
    }
  }, [currentMarkerIndex]);

  const handleNext = useCallback(() => {
    if (currentMarkerIndex !== null && currentMarkerIndex < markers.length - 1) {
      setCurrentMarkerIndex(currentMarkerIndex + 1);
    }
  }, [currentMarkerIndex, markers.length]);

  // Handle saving video URL
  const handleSaveVideoUrl = useCallback(async () => {
    if (!videoUrlInput.trim() || !supabase || !sessionId) return;

    setSavingUrl(true);
    try {
      // Update session with video URL
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ video_url: videoUrlInput.trim() })
        .eq("id", sessionId);

      if (updateError) throw updateError;

      setSession((prev) => (prev ? { ...prev, video_url: videoUrlInput.trim() } : prev));
      setVideoUrlInput("");
      showToast("Video URL saved!", "success");
    } catch (err) {
      console.error("Error saving video URL:", err);
      showToast("Failed to save video URL", "error");
    } finally {
      setSavingUrl(false);
    }
  }, [videoUrlInput, supabase, sessionId, showToast]);

  // Handle clearing video URL
  const handleClearVideoUrl = useCallback(async () => {
    if (!supabase || !sessionId) return;

    setSavingUrl(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ video_url: null })
        .eq("id", sessionId);

      if (error) throw error;

      setSession((prev) => (prev ? { ...prev, video_url: null } : prev));
      showToast("Video removed", "success");
    } catch (err) {
      console.error("Error clearing video URL:", err);
      showToast("Failed to remove video", "error");
    } finally {
      setSavingUrl(false);
    }
  }, [supabase, sessionId, showToast]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading session...</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-gray-400" />
        <p className="text-gray-500">Session not found</p>
        <Button asChild variant="outline">
          <Link href="/">Back to Home</Link>
        </Button>
      </main>
    );
  }

  const pitcher = Array.isArray(session.pitchers) ? session.pitchers[0] : session.pitchers;
  const pitcherName = pitcher?.name || "Unknown Pitcher";
  const sessionLabel = session.label || `Session ${session.session_date}`;

  return (
    <main className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 border-b bg-white">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/sessions/${sessionId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-semibold">{pitcherName}</h1>
          <p className="text-sm text-gray-500">{sessionLabel} - {session.session_date}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {markers.length} pitches marked
          </span>
          {session.video_url && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearVideoUrl}
              disabled={savingUrl}
            >
              Change Video
            </Button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
          {session.video_url ? (
            <>
              <div className="flex-1 relative min-h-0 p-2">
                <VideoPlayer
                  src={session.video_url}
                  markers={markers}
                  onMarkPitch={handleMarkPitch}
                  onMarkerClick={handleMarkerClick}
                  currentMarkerIndex={currentMarkerIndex ?? undefined}
                  className="w-full h-full max-h-full"
                />
              </div>

              {/* Tagging overlay - positioned below video */}
              {showTaggingOverlay && currentPitch && (
                <div className="border-t border-gray-700 bg-white max-h-[50%] overflow-y-auto">
                  <PitchTaggingOverlay
                    pitch={currentPitch}
                    pitchNumber={(currentMarkerIndex ?? 0) + 1}
                    totalPitches={markers.length}
                    onSave={handleSavePitch}
                    onDelete={handleDeletePitch}
                    onClose={() => setShowTaggingOverlay(false)}
                    onPrevious={currentMarkerIndex !== null && currentMarkerIndex > 0 ? handlePrevious : undefined}
                    onNext={currentMarkerIndex !== null && currentMarkerIndex < markers.length - 1 ? handleNext : undefined}
                    onNextUntagged={hasUntaggedPitches ? handleNextUntagged : undefined}
                    hasUntaggedPitches={hasUntaggedPitches}
                  />
                </div>
              )}
            </>
          ) : (
            // No video - show URL input UI
            <div className="flex-1 flex items-center justify-center">
              <Card className="max-w-md w-full mx-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    Add Session Video
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Paste a video URL to start tagging pitches. Works with direct video links, YouTube, or any hosted video.
                  </p>

                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          type="url"
                          placeholder="https://youtube.com/watch?v=... or direct video URL"
                          value={videoUrlInput}
                          onChange={(e) => setVideoUrlInput(e.target.value)}
                          className="pl-9"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && videoUrlInput.trim()) {
                              handleSaveVideoUrl();
                            }
                          }}
                        />
                      </div>
                      <Button
                        disabled={!videoUrlInput.trim() || savingUrl}
                        onClick={handleSaveVideoUrl}
                      >
                        {savingUrl ? "Saving..." : "Add Video"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                    <p className="text-sm font-medium text-gray-700">Supported sources:</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• <strong>YouTube</strong> - Paste any YouTube link</li>
                      <li>• <strong>Direct video URLs</strong> - .mp4, .mov, .webm files</li>
                      <li>• <strong>Cloud storage</strong> - Google Drive, Dropbox (use direct/download link)</li>
                      <li>• <strong>Any video hosting</strong> - Vimeo, Streamable, etc.</li>
                    </ul>
                  </div>

                  <p className="text-xs text-gray-400 text-center">
                    Tip: For best results, use a direct video file URL or YouTube link.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {session.video_url && (
          <div className="w-80 flex-shrink-0">
            <PitchReviewSidebar
              markers={markers}
              currentMarkerIndex={currentMarkerIndex}
              onMarkerSelect={handleMarkerSelect}
              onNextUntagged={handleNextUntagged}
              filter={sidebarFilter}
              onFilterChange={setSidebarFilter}
            />
          </div>
        )}
      </div>
    </main>
  );
}
