"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  Plus,
} from "lucide-react";

export interface PitchMarker {
  id: string;
  timestamp: number;
  pitchType?: string;
  tagged: boolean;
  label?: string;
}

interface VideoPlayerProps {
  src: string;
  markers?: PitchMarker[];
  onMarkPitch?: (timestamp: number) => void;
  onMarkerClick?: (marker: PitchMarker) => void;
  onTimeUpdate?: (currentTime: number) => void;
  currentMarkerIndex?: number;
  className?: string;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const SCRUB_AMOUNT = 0.1; // 100ms frame-accurate scrubbing
const SKIP_AMOUNT = 5; // 5 seconds for skip forward/back

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}

// Detect if URL is a YouTube link
function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

// Extract YouTube video ID
function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "") || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

// Detect if URL is a Google Drive link
function isGoogleDriveUrl(url: string): boolean {
  return /drive\.google\.com/i.test(url);
}

// Extract Google Drive file ID and convert to embeddable URL
function getGoogleDriveEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Handle /file/d/FILE_ID/view format
    const fileMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) {
      return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }
    // Handle ?id=FILE_ID format
    const idParam = parsed.searchParams.get("id");
    if (idParam) {
      return `https://drive.google.com/file/d/${idParam}/preview`;
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoPlayer({
  src,
  markers = [],
  onMarkPitch,
  onMarkerClick,
  onTimeUpdate,
  currentMarkerIndex,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if source is YouTube
  const isYouTube = isYouTubeUrl(src);
  const youtubeId = isYouTube ? extractYouTubeId(src) : null;

  // Check if source is Google Drive
  const isGoogleDrive = isGoogleDriveUrl(src);
  const googleDriveEmbedUrl = isGoogleDrive ? getGoogleDriveEmbedUrl(src) : null;

  // Play/Pause toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  // Seek to specific time
  const seekTo = useCallback((time: number) => {
    if (!videoRef.current) return;
    const clampedTime = Math.max(0, Math.min(time, duration));
    videoRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  }, [duration]);

  // Scrub forward/backward by small amount
  const scrub = useCallback((amount: number) => {
    if (!videoRef.current) return;
    seekTo(videoRef.current.currentTime + amount);
  }, [seekTo]);

  // Skip forward/backward by larger amount
  const skip = useCallback((amount: number) => {
    if (!videoRef.current) return;
    seekTo(videoRef.current.currentTime + amount);
  }, [seekTo]);

  // Change playback speed
  const cyclePlaybackSpeed = useCallback(() => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(newSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = newSpeed;
    }
  }, [playbackSpeed]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [isFullscreen]);

  // Mark pitch at current timestamp
  const handleMarkPitch = useCallback(() => {
    if (!videoRef.current || !onMarkPitch) return;
    onMarkPitch(videoRef.current.currentTime);
  }, [onMarkPitch]);

  // Handle progress bar click
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seekTo(percent * duration);
  }, [duration, seekTo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
          e.preventDefault();
          handleMarkPitch();
          break;
        case "arrowleft":
          e.preventDefault();
          if (e.shiftKey) {
            scrub(-SCRUB_AMOUNT); // Fine scrub with Shift
          } else {
            skip(-SKIP_AMOUNT);
          }
          break;
        case "arrowright":
          e.preventDefault();
          if (e.shiftKey) {
            scrub(SCRUB_AMOUNT); // Fine scrub with Shift
          } else {
            skip(SKIP_AMOUNT);
          }
          break;
        case "arrowup":
          e.preventDefault();
          setVolume((v) => Math.min(1, v + 0.1));
          break;
        case "arrowdown":
          e.preventDefault();
          setVolume((v) => Math.max(0, v - 0.1));
          break;
        case ",":
          e.preventDefault();
          scrub(-SCRUB_AMOUNT); // Frame back
          break;
        case ".":
          e.preventDefault();
          scrub(SCRUB_AMOUNT); // Frame forward
          break;
        case "s":
          e.preventDefault();
          cyclePlaybackSpeed();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "0":
        case "home":
          e.preventDefault();
          seekTo(0);
          break;
        case "end":
          e.preventDefault();
          seekTo(duration);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, handleMarkPitch, scrub, skip, cyclePlaybackSpeed, toggleFullscreen, seekTo, duration]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdateEvent = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };
    const onDurationChange = () => setDuration(video.duration);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdateEvent);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("volumechange", onVolumeChange);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdateEvent);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, [onTimeUpdate]);

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Apply volume changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  // Seek to marker when currentMarkerIndex changes
  useEffect(() => {
    if (currentMarkerIndex !== undefined && markers[currentMarkerIndex]) {
      const marker = markers[currentMarkerIndex];
      if (videoRef.current && marker.timestamp !== undefined) {
        videoRef.current.currentTime = marker.timestamp;
        setCurrentTime(marker.timestamp);
      }
    }
  }, [currentMarkerIndex, markers]);

  // Auto-hide controls
  useEffect(() => {
    const showControlsHandler = () => {
      setShowControls(true);
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
      if (isPlaying) {
        hideControlsTimer.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", showControlsHandler);
      container.addEventListener("mouseenter", showControlsHandler);
    }

    return () => {
      if (container) {
        container.removeEventListener("mousemove", showControlsHandler);
        container.removeEventListener("mouseenter", showControlsHandler);
      }
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [isPlaying]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // For YouTube videos, show iframe with instructions
  if (isYouTube && youtubeId) {
    return (
      <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
        <div className="aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Session video"
          />
        </div>
        <div className="bg-amber-50 border-t border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <div className="text-amber-500 text-lg">⚠️</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">YouTube videos have limited tagging support</p>
              <p className="text-xs text-amber-700 mt-1">
                For the best experience with pitch marking and timeline controls, use a direct video URL (.mp4, .mov, .webm).
                You can still watch the video and manually note timestamps, but automatic controls won&apos;t work with YouTube embeds.
              </p>
              <p className="text-xs text-amber-600 mt-2">
                <strong>Tip:</strong> Upload your video to a service that provides direct links, or host it yourself.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For Google Drive videos, show iframe with instructions
  if (isGoogleDrive && googleDriveEmbedUrl) {
    return (
      <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
        <div className="aspect-video">
          <iframe
            src={googleDriveEmbedUrl}
            className="w-full h-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
            title="Session video"
          />
        </div>
        <div className="bg-amber-50 border-t border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <div className="text-amber-500 text-lg">⚠️</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Google Drive videos have limited tagging support</p>
              <p className="text-xs text-amber-700 mt-1">
                For the best experience with pitch marking and timeline controls, use a direct video URL (.mp4, .mov, .webm).
                You can still watch the video and manually note timestamps, but automatic controls won&apos;t work with Google Drive embeds.
              </p>
              <p className="text-xs text-amber-600 mt-2">
                <strong>Note:</strong> Make sure the video is shared as &quot;Anyone with the link can view&quot; in Google Drive.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-lg overflow-hidden group flex flex-col ${className}`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        className="w-full flex-1 min-h-0 object-contain"
        onClick={togglePlay}
        playsInline
      />

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
          showControls || !isPlaying ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        {/* Progress Bar with Markers */}
        <div className="relative px-4 pb-3">
          <div
            ref={progressRef}
            className="relative h-3 bg-white/30 rounded-full cursor-pointer group/progress"
            onClick={handleProgressClick}
          >
            {/* Buffered */}
            <div className="absolute inset-y-0 left-0 bg-white/40 rounded-full" style={{ width: "0%" }} />

            {/* Progress */}
            <div
              className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
              style={{ width: `${progress}%` }}
            />

            {/* Pitch Markers */}
            {markers.map((marker, idx) => {
              const markerPercent = duration > 0 ? (marker.timestamp / duration) * 100 : 0;
              const isActive = idx === currentMarkerIndex;
              const isTagged = marker.tagged;

              return (
                <button
                  key={marker.id}
                  className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-all hover:scale-125 ${
                    isActive
                      ? "bg-yellow-400 border-yellow-200 scale-125"
                      : isTagged
                      ? "bg-green-500 border-green-300"
                      : "bg-orange-500 border-orange-300"
                  }`}
                  style={{ left: `${markerPercent}%`, transform: "translate(-50%, -50%)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekTo(marker.timestamp);
                    onMarkerClick?.(marker);
                  }}
                  title={`${marker.label || `Pitch ${idx + 1}`} - ${formatTime(marker.timestamp)}${
                    isTagged ? " (tagged)" : " (untagged)"
                  }`}
                />
              );
            })}

            {/* Playhead */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `${progress}%`, transform: "translate(-50%, -50%)" }}
            />
          </div>
        </div>

        {/* Control Buttons */}
        <div className="relative flex items-center gap-2 px-4 pb-5 pt-2 text-white">
          {/* Play/Pause */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={togglePlay}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>

          {/* Skip Back */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => skip(-SKIP_AMOUNT)}
            title={`Skip back ${SKIP_AMOUNT}s (Left Arrow)`}
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          {/* Skip Forward */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => skip(SKIP_AMOUNT)}
            title={`Skip forward ${SKIP_AMOUNT}s (Right Arrow)`}
          >
            <SkipForward className="h-4 w-4" />
          </Button>

          {/* Time Display */}
          <span className="text-sm font-mono tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Mark Pitch Button */}
          {onMarkPitch && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20 gap-1"
              onClick={handleMarkPitch}
              title="Mark Pitch (M)"
            >
              <Plus className="h-4 w-4" />
              Mark Pitch
            </Button>
          )}

          {/* Playback Speed */}
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 font-mono text-xs min-w-[50px]"
            onClick={cyclePlaybackSpeed}
            title="Change Speed (S)"
          >
            {playbackSpeed}x
          </Button>

          {/* Volume */}
          <div className="flex items-center gap-1 group/volume">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={toggleMute}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-200">
              <Slider
                value={[isMuted ? 0 : volume * 100]}
                max={100}
                step={1}
                onValueChange={([val]) => {
                  setVolume(val / 100);
                  if (val > 0 && isMuted) setIsMuted(false);
                }}
                className="w-full"
              />
            </div>
          </div>

          {/* Fullscreen */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={toggleFullscreen}
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Play button overlay when paused */}
      {!isPlaying && (
        <button
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40"
          onClick={togglePlay}
        >
          <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="h-10 w-10 text-black ml-1" />
          </div>
        </button>
      )}

      {/* Keyboard Shortcuts Help (shown on hover) */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-black/70 rounded-lg px-3 py-2 text-white text-xs space-y-1">
          <div><kbd className="bg-white/20 px-1 rounded">Space</kbd> Play/Pause</div>
          <div><kbd className="bg-white/20 px-1 rounded">M</kbd> Mark Pitch</div>
          <div><kbd className="bg-white/20 px-1 rounded">←</kbd><kbd className="bg-white/20 px-1 rounded">→</kbd> Skip 5s</div>
          <div><kbd className="bg-white/20 px-1 rounded">Shift</kbd>+<kbd className="bg-white/20 px-1 rounded">←</kbd><kbd className="bg-white/20 px-1 rounded">→</kbd> Frame</div>
          <div><kbd className="bg-white/20 px-1 rounded">S</kbd> Speed</div>
        </div>
      </div>
    </div>
  );
}
