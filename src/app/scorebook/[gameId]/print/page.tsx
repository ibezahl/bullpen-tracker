"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchFullGameData, getErrorMessage } from "@/lib/scorebook/db";
import type { FullGameData } from "@/lib/scorebook/db";
import { useToast } from "@/components/ui/toast";
import {
  computeTeamBattingStats,
  computeTeamPitchingStats,
  computeLineScore,
  formatAverage,
  formatERA,
} from "@/lib/scorebook/stats";
import {
  generateGameCSV,
  generateBoxScoreCSV,
  downloadCSV,
  generateExportFilename,
} from "@/lib/scorebook/export";
import type { Session } from "@supabase/supabase-js";

export default function PrintScorebookPage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  const { showToast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [gameData, setGameData] = useState<FullGameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [printed, setPrinted] = useState(false);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        router.push("/login");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        router.push("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Load game data
  const loadGameData = useCallback(async () => {
    if (!gameId) return;

    setLoading(true);
    try {
      const data = await fetchFullGameData(gameId);
      if (!data) {
        showToast("Game not found", "error");
        router.push("/scorebook");
        return;
      }
      setGameData(data);
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setLoading(false);
    }
  }, [gameId, showToast, router]);

  useEffect(() => {
    if (session?.user?.id && gameId) {
      loadGameData();
    }
  }, [session?.user?.id, gameId, loadGameData]);

  // Auto-print on load
  useEffect(() => {
    if (printed || loading || !gameData) return;
    const timer = setTimeout(() => {
      window.print();
      setPrinted(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [printed, loading, gameData]);

  const handleExportPlays = () => {
    if (!gameData) return;
    const csv = generateGameCSV(gameData);
    const filename = generateExportFilename(
      gameData.game.away_team_name,
      gameData.game.home_team_name,
      gameData.game.game_date,
      "plays"
    );
    downloadCSV(csv, filename);
  };

  const handleExportBoxScore = () => {
    if (!gameData) return;
    const csv = generateBoxScoreCSV(gameData);
    const filename = generateExportFilename(
      gameData.game.away_team_name,
      gameData.game.home_team_name,
      gameData.game.game_date,
      "boxscore"
    );
    downloadCSV(csv, filename);
  };

  if (!session || loading) {
    return (
      <main className="min-h-screen bg-white p-6">
        <p className="text-center text-gray-500">Loading...</p>
      </main>
    );
  }

  if (!gameData) {
    return null;
  }

  const { game, homeLineup, awayLineup, atBats, plays } = gameData;

  // Compute stats for print
  const awayBatting = computeTeamBattingStats(atBats, plays, awayLineup);
  const homeBatting = computeTeamBattingStats(atBats, plays, homeLineup);
  const awayPitching = computeTeamPitchingStats(atBats, plays, awayLineup);
  const homePitching = computeTeamPitchingStats(atBats, plays, homeLineup);
  const maxInning = Math.max(game.current_inning, ...atBats.map((ab) => ab.inning), 1);
  const lineScore = computeLineScore(atBats, plays, maxInning);

  return (
    <main className="min-h-screen bg-white text-black p-6 print:p-4">
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          table { font-size: 10pt; }
        }
        @page { size: portrait; margin: 0.5in; }
      `}</style>

      {/* Header */}
      <header className="text-center mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">
          {game.away_team_name} @ {game.home_team_name}
        </h1>
        <p className="text-sm text-gray-600">
          {new Date(game.game_date).toLocaleDateString()}
          {game.location && ` • ${game.location}`}
        </p>
        <p className="text-xl font-bold mt-2">
          Final: {game.away_team_name} {game.away_final_score} - {game.home_team_name} {game.home_final_score}
        </p>
      </header>

      {/* Line Score */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Line Score</h2>
        <table className="w-full border-collapse border border-gray-400 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 px-2 py-1 text-left">Team</th>
              {Array.from({ length: maxInning }, (_, i) => (
                <th key={i} className="border border-gray-400 px-2 py-1 text-center w-8">
                  {i + 1}
                </th>
              ))}
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">R</th>
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">H</th>
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">E</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-400 px-2 py-1 font-medium">{game.away_team_name}</td>
              {Array.from({ length: maxInning }, (_, i) => (
                <td key={i} className="border border-gray-400 px-2 py-1 text-center">
                  {lineScore.away[i] ?? "-"}
                </td>
              ))}
              <td className="border border-gray-400 px-2 py-1 text-center font-bold">{lineScore.awayTotal.r}</td>
              <td className="border border-gray-400 px-2 py-1 text-center font-bold">{lineScore.awayTotal.h}</td>
              <td className="border border-gray-400 px-2 py-1 text-center font-bold">{lineScore.awayTotal.e}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 font-medium">{game.home_team_name}</td>
              {Array.from({ length: maxInning }, (_, i) => (
                <td key={i} className="border border-gray-400 px-2 py-1 text-center">
                  {lineScore.home[i] ?? "-"}
                </td>
              ))}
              <td className="border border-gray-400 px-2 py-1 text-center font-bold">{lineScore.homeTotal.r}</td>
              <td className="border border-gray-400 px-2 py-1 text-center font-bold">{lineScore.homeTotal.h}</td>
              <td className="border border-gray-400 px-2 py-1 text-center font-bold">{lineScore.homeTotal.e}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Batting Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <section>
          <h2 className="text-lg font-semibold mb-2">{game.away_team_name} Batting</h2>
          <table className="w-full border-collapse border border-gray-400 text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 px-1 py-1 text-left">Player</th>
                <th className="border border-gray-400 px-1 py-1 text-center">AB</th>
                <th className="border border-gray-400 px-1 py-1 text-center">R</th>
                <th className="border border-gray-400 px-1 py-1 text-center">H</th>
                <th className="border border-gray-400 px-1 py-1 text-center">RBI</th>
                <th className="border border-gray-400 px-1 py-1 text-center">BB</th>
                <th className="border border-gray-400 px-1 py-1 text-center">K</th>
              </tr>
            </thead>
            <tbody>
              {awayBatting.batters.map((b) => (
                <tr key={b.lineupId}>
                  <td className="border border-gray-400 px-1 py-1">{b.battingOrder}. {b.playerName}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.ab}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.r}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.h}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.rbi}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.bb}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.k}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-50">
                <td className="border border-gray-400 px-1 py-1">Totals</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{awayBatting.totals.ab}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{awayBatting.totals.r}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{awayBatting.totals.h}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{awayBatting.totals.rbi}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{awayBatting.totals.bb}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{awayBatting.totals.k}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{game.home_team_name} Batting</h2>
          <table className="w-full border-collapse border border-gray-400 text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 px-1 py-1 text-left">Player</th>
                <th className="border border-gray-400 px-1 py-1 text-center">AB</th>
                <th className="border border-gray-400 px-1 py-1 text-center">R</th>
                <th className="border border-gray-400 px-1 py-1 text-center">H</th>
                <th className="border border-gray-400 px-1 py-1 text-center">RBI</th>
                <th className="border border-gray-400 px-1 py-1 text-center">BB</th>
                <th className="border border-gray-400 px-1 py-1 text-center">K</th>
              </tr>
            </thead>
            <tbody>
              {homeBatting.batters.map((b) => (
                <tr key={b.lineupId}>
                  <td className="border border-gray-400 px-1 py-1">{b.battingOrder}. {b.playerName}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.ab}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.r}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.h}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.rbi}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.bb}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.k}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-50">
                <td className="border border-gray-400 px-1 py-1">Totals</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{homeBatting.totals.ab}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{homeBatting.totals.r}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{homeBatting.totals.h}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{homeBatting.totals.rbi}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{homeBatting.totals.bb}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{homeBatting.totals.k}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      {/* Pitching Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <section>
          <h2 className="text-lg font-semibold mb-2">{game.away_team_name} Pitching</h2>
          <table className="w-full border-collapse border border-gray-400 text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 px-1 py-1 text-left">Pitcher</th>
                <th className="border border-gray-400 px-1 py-1 text-center">IP</th>
                <th className="border border-gray-400 px-1 py-1 text-center">H</th>
                <th className="border border-gray-400 px-1 py-1 text-center">R</th>
                <th className="border border-gray-400 px-1 py-1 text-center">ER</th>
                <th className="border border-gray-400 px-1 py-1 text-center">BB</th>
                <th className="border border-gray-400 px-1 py-1 text-center">K</th>
              </tr>
            </thead>
            <tbody>
              {awayPitching.pitchers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border border-gray-400 px-1 py-1 text-center text-gray-500">
                    No pitching data
                  </td>
                </tr>
              ) : (
                awayPitching.pitchers.map((p) => (
                  <tr key={p.lineupId}>
                    <td className="border border-gray-400 px-1 py-1">{p.playerName}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.ipDisplay}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.h}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.r}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.er}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.bb}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.k}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{game.home_team_name} Pitching</h2>
          <table className="w-full border-collapse border border-gray-400 text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 px-1 py-1 text-left">Pitcher</th>
                <th className="border border-gray-400 px-1 py-1 text-center">IP</th>
                <th className="border border-gray-400 px-1 py-1 text-center">H</th>
                <th className="border border-gray-400 px-1 py-1 text-center">R</th>
                <th className="border border-gray-400 px-1 py-1 text-center">ER</th>
                <th className="border border-gray-400 px-1 py-1 text-center">BB</th>
                <th className="border border-gray-400 px-1 py-1 text-center">K</th>
              </tr>
            </thead>
            <tbody>
              {homePitching.pitchers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border border-gray-400 px-1 py-1 text-center text-gray-500">
                    No pitching data
                  </td>
                </tr>
              ) : (
                homePitching.pitchers.map((p) => (
                  <tr key={p.lineupId}>
                    <td className="border border-gray-400 px-1 py-1">{p.playerName}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.ipDisplay}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.h}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.r}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.er}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.bb}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center">{p.k}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/* No-print controls */}
      <div className="no-print mt-6 pt-4 border-t flex items-center justify-center gap-4">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded"
        >
          Print Again
        </button>
        <button
          onClick={handleExportPlays}
          className="px-4 py-2 bg-green-500 text-white hover:bg-green-600 rounded"
        >
          Export Plays CSV
        </button>
        <button
          onClick={handleExportBoxScore}
          className="px-4 py-2 bg-green-500 text-white hover:bg-green-600 rounded"
        >
          Export Box Score CSV
        </button>
        <button
          onClick={() => router.push(`/scorebook/${gameId}`)}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
        >
          Back to Game
        </button>
      </div>
    </main>
  );
}
