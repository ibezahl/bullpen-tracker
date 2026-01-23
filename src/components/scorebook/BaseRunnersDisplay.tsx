"use client";

import type { BaseState, GameLineupEntry } from "@/lib/scorebook/types";
import { getPlayerShortName } from "@/lib/scorebook/types";

type Props = {
  bases: BaseState;
  size?: "sm" | "md" | "lg";
};

export function BaseRunnersDisplay({ bases, size = "md" }: Props) {
  const sizeClasses = {
    sm: { container: "w-16 h-16", base: "w-4 h-4", text: "text-[8px]" },
    md: { container: "w-24 h-24", base: "w-6 h-6", text: "text-[10px]" },
    lg: { container: "w-32 h-32", base: "w-8 h-8", text: "text-xs" },
  };

  const classes = sizeClasses[size];

  const BaseMarker = ({
    runner,
    position,
  }: {
    runner: GameLineupEntry | null;
    position: "first" | "second" | "third";
  }) => {
    const positionClasses = {
      first: "right-0 top-1/2 -translate-y-1/2",
      second: "top-0 left-1/2 -translate-x-1/2",
      third: "left-0 top-1/2 -translate-y-1/2",
    };

    const isOccupied = runner !== null;

    return (
      <div
        className={`absolute ${positionClasses[position]} ${classes.base} transform rotate-45 border-2 ${
          isOccupied ? "bg-yellow-400 border-yellow-600" : "bg-white border-gray-300"
        }`}
        title={runner ? getPlayerShortName(runner) : undefined}
      />
    );
  };

  return (
    <div className={`relative ${classes.container}`}>
      {/* Diamond shape background */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-full relative">
          {/* Base paths (lines) */}
          <svg viewBox="0 0 100 100" className="w-full h-full text-gray-300">
            <line x1="50" y1="85" x2="85" y2="50" stroke="currentColor" strokeWidth="2" />
            <line x1="85" y1="50" x2="50" y2="15" stroke="currentColor" strokeWidth="2" />
            <line x1="50" y1="15" x2="15" y2="50" stroke="currentColor" strokeWidth="2" />
            <line x1="15" y1="50" x2="50" y2="85" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      </div>

      {/* Home plate */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-3 bg-white border-2 border-gray-400" />

      {/* Bases */}
      <BaseMarker runner={bases.first} position="first" />
      <BaseMarker runner={bases.second} position="second" />
      <BaseMarker runner={bases.third} position="third" />

      {/* Runner names (for larger sizes) */}
      {size !== "sm" && (
        <>
          {bases.first && (
            <div
              className={`absolute right-0 top-1/2 translate-x-full ml-1 ${classes.text} whitespace-nowrap`}
            >
              {getPlayerShortName(bases.first)}
            </div>
          )}
          {bases.second && (
            <div
              className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-1 ${classes.text} whitespace-nowrap`}
            >
              {getPlayerShortName(bases.second)}
            </div>
          )}
          {bases.third && (
            <div
              className={`absolute left-0 top-1/2 -translate-x-full mr-1 ${classes.text} whitespace-nowrap text-right`}
            >
              {getPlayerShortName(bases.third)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Simple out counter display (3 circles)
 */
export function OutCounter({ outs }: { outs: number }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border-2 ${
            i < outs ? "bg-red-500 border-red-600" : "bg-white border-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Combined game situation display
 */
export function GameSituationDisplay({
  bases,
  outs,
  inning,
  half,
}: {
  bases: BaseState;
  outs: number;
  inning: number;
  half: "top" | "bottom";
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-center">
        <div className="text-sm text-gray-500">
          {half === "top" ? "Top" : "Bot"} {inning}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-medium">{outs} Out{outs !== 1 ? "s" : ""}</span>
          <OutCounter outs={outs} />
        </div>
      </div>
      <BaseRunnersDisplay bases={bases} size="sm" />
    </div>
  );
}
