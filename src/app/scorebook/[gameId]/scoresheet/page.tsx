"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchFullGameData, getErrorMessage } from "@/lib/scorebook/db";
import type { FullGameData } from "@/lib/scorebook/db";
import { useToast } from "@/components/ui/toast";
import { FullGameScoresheet } from "@/components/scorebook/TraditionalScoresheet";
import type { Session } from "@supabase/supabase-js";

export default function TraditionalScoresheetPage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  const { showToast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [gameData, setGameData] = useState<FullGameData | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <main className="min-h-screen bg-white text-black p-6 print:p-4">
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        @page { size: landscape; margin: 0.4in; }
      `}</style>

      {/* No-print controls */}
      <div className="no-print mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/scorebook/${gameId}`)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >
            Back to Game
          </button>
          <button
            onClick={() => router.push(`/scorebook/${gameId}/box-score`)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >
            Box Score View
          </button>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded text-sm"
        >
          Print Scoresheet
        </button>
      </div>

      {/* Traditional scoresheet */}
      <FullGameScoresheet gameData={gameData} />

      {/* No-print footer controls */}
      <div className="no-print mt-8 pt-4 border-t flex items-center justify-center gap-4">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded"
        >
          Print Scoresheet
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
