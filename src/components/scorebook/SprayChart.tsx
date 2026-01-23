"use client";

import { useState, useRef, useCallback } from "react";

type Props = {
  value?: { x: number; y: number } | null;
  onChange: (location: { x: number; y: number } | null) => void;
  readOnly?: boolean;
  size?: "sm" | "md" | "lg";
  showZones?: boolean;
};

/**
 * Interactive baseball field spray chart for recording hit locations.
 * Coordinates are normalized 0-1, with (0.5, 1) being home plate.
 */
export function SprayChart({
  value,
  onChange,
  readOnly = false,
  size = "md",
  showZones = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const sizeClasses = {
    sm: "w-32 h-32",
    md: "w-48 h-48",
    lg: "w-64 h-64",
  };

  const markerSize = {
    sm: 6,
    md: 8,
    lg: 10,
  };

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      // Normalize to field coordinates
      onChange({ x, y });
    },
    [readOnly, onChange]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setHoverPos({ x, y });
    },
    [readOnly]
  );

  const getLocationLabel = (x: number, y: number): string => {
    // Determine general field location
    const centerX = 0.5;
    const leftThird = 0.35;
    const rightThird = 0.65;

    // Depth zones (y increases downward in our coordinate system)
    const infieldY = 0.7;
    const shallowOutfieldY = 0.5;
    const deepOutfieldY = 0.25;

    let horizontal = "";
    if (x < leftThird) horizontal = "Left";
    else if (x > rightThird) horizontal = "Right";
    else horizontal = "Center";

    let depth = "";
    if (y > infieldY) depth = "Infield";
    else if (y > shallowOutfieldY) depth = "Shallow";
    else if (y > deepOutfieldY) depth = "Deep";
    else depth = "Warning Track";

    return `${depth} ${horizontal}`;
  };

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`${sizeClasses[size]} relative cursor-crosshair bg-green-100 rounded-lg overflow-hidden border-2 border-green-300`}
        onClick={handleClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
          setIsHovering(false);
          setHoverPos(null);
        }}
        onMouseMove={handleMouseMove}
      >
        {/* Field SVG */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Outfield grass */}
          <path
            d="M 50 95 L 5 50 A 60 60 0 0 1 95 50 Z"
            fill="#4ade80"
            stroke="#22c55e"
            strokeWidth="0.5"
          />

          {/* Infield dirt */}
          <path
            d="M 50 95 L 30 75 L 50 55 L 70 75 Z"
            fill="#d4a574"
            stroke="#b8956a"
            strokeWidth="0.5"
          />

          {/* Base paths */}
          <line x1="50" y1="95" x2="30" y2="75" stroke="#fff" strokeWidth="0.5" />
          <line x1="30" y1="75" x2="50" y2="55" stroke="#fff" strokeWidth="0.5" />
          <line x1="50" y1="55" x2="70" y2="75" stroke="#fff" strokeWidth="0.5" />
          <line x1="70" y1="75" x2="50" y2="95" stroke="#fff" strokeWidth="0.5" />

          {/* Bases */}
          <rect x="48" y="93" width="4" height="4" fill="white" /> {/* Home */}
          <rect
            x="28"
            y="73"
            width="4"
            height="4"
            fill="white"
            transform="rotate(45 30 75)"
          /> {/* 1B */}
          <rect
            x="48"
            y="53"
            width="4"
            height="4"
            fill="white"
            transform="rotate(45 50 55)"
          /> {/* 2B */}
          <rect
            x="68"
            y="73"
            width="4"
            height="4"
            fill="white"
            transform="rotate(45 70 75)"
          /> {/* 3B */}

          {/* Foul lines */}
          <line x1="50" y1="95" x2="5" y2="50" stroke="#fff" strokeWidth="1" />
          <line x1="50" y1="95" x2="95" y2="50" stroke="#fff" strokeWidth="1" />

          {/* Zone labels (if showZones) */}
          {showZones && (
            <>
              <text x="20" y="45" fontSize="6" fill="#166534" className="select-none">
                LF
              </text>
              <text x="47" y="30" fontSize="6" fill="#166534" className="select-none">
                CF
              </text>
              <text x="75" y="45" fontSize="6" fill="#166534" className="select-none">
                RF
              </text>
              <text x="25" y="78" fontSize="5" fill="#92400e" className="select-none">
                SS
              </text>
              <text x="68" y="78" fontSize="5" fill="#92400e" className="select-none">
                2B
              </text>
            </>
          )}
        </svg>

        {/* Current value marker */}
        {value && (
          <div
            className="absolute rounded-full bg-red-500 border-2 border-white shadow-md"
            style={{
              width: markerSize[size],
              height: markerSize[size],
              left: `${value.x * 100}%`,
              top: `${value.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}

        {/* Hover preview */}
        {!readOnly && isHovering && hoverPos && !value && (
          <div
            className="absolute rounded-full bg-red-300 border border-red-400 opacity-50"
            style={{
              width: markerSize[size],
              height: markerSize[size],
              left: `${hoverPos.x * 100}%`,
              top: `${hoverPos.y * 100}%`,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Location label */}
      {value && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{getLocationLabel(value.x, value.y)}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {!value && !readOnly && (
        <p className="text-xs text-gray-500">Click to mark hit location</p>
      )}
    </div>
  );
}

/**
 * Read-only display of multiple hit locations (for heatmap view)
 */
export function SprayChartHeatmap({
  hits,
  size = "md",
}: {
  hits: Array<{ x: number; y: number; type?: string }>;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-32 h-32",
    md: "w-48 h-48",
    lg: "w-64 h-64",
  };

  const getHitColor = (type?: string): string => {
    switch (type) {
      case "1B":
        return "#3b82f6"; // Blue
      case "2B":
        return "#22c55e"; // Green
      case "3B":
        return "#f59e0b"; // Amber
      case "HR":
        return "#ef4444"; // Red
      default:
        return "#6b7280"; // Gray
    }
  };

  return (
    <div
      className={`${sizeClasses[size]} relative bg-green-100 rounded-lg overflow-hidden border-2 border-green-300`}
    >
      {/* Field SVG (same as SprayChart) */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d="M 50 95 L 5 50 A 60 60 0 0 1 95 50 Z"
          fill="#4ade80"
          stroke="#22c55e"
          strokeWidth="0.5"
        />
        <path
          d="M 50 95 L 30 75 L 50 55 L 70 75 Z"
          fill="#d4a574"
          stroke="#b8956a"
          strokeWidth="0.5"
        />
        <line x1="50" y1="95" x2="5" y2="50" stroke="#fff" strokeWidth="1" />
        <line x1="50" y1="95" x2="95" y2="50" stroke="#fff" strokeWidth="1" />
      </svg>

      {/* Hit markers */}
      {hits.map((hit, idx) => (
        <div
          key={idx}
          className="absolute rounded-full border border-white shadow-sm"
          style={{
            width: 6,
            height: 6,
            left: `${hit.x * 100}%`,
            top: `${hit.y * 100}%`,
            transform: "translate(-50%, -50%)",
            backgroundColor: getHitColor(hit.type),
          }}
        />
      ))}
    </div>
  );
}
