"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import AccountBar from "@/components/AccountBar";
import { Target, ClipboardList } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
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

  if (loading || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
              Baseball Tools
            </h1>
            <p className="text-slate-600 mt-2">
              Choose a tool to get started
            </p>
          </div>
          <AccountBar />
        </div>

        {/* Feature Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Bullpen Tracker */}
          <Link href="/bullpen" className="block group">
            <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-slate-300 group-focus:ring-2 group-focus:ring-slate-400">
              <CardContent className="p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <Target className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Bullpen Tracker
                    </h2>
                    <p className="text-slate-600 mt-2 leading-relaxed">
                      Log bullpen sessions, track pitch command, and analyze location accuracy over time.
                    </p>
                    <ul className="mt-4 space-y-1.5 text-sm text-slate-500">
                      <li>• Track intended vs actual pitch location</li>
                      <li>• Organize sessions by pitcher</li>
                      <li>• View command trends and stats</li>
                      <li>• Tag pitches for video review</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Scorebook */}
          <Link href="/scorebook" className="block group">
            <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-slate-300 group-focus:ring-2 group-focus:ring-slate-400">
              <CardContent className="p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors">
                    <ClipboardList className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-slate-900 group-hover:text-green-600 transition-colors">
                      Scorebook
                    </h2>
                    <p className="text-slate-600 mt-2 leading-relaxed">
                      Keep score for baseball games with full lineup tracking, substitutions, and live stats.
                    </p>
                    <ul className="mt-4 space-y-1.5 text-sm text-slate-500">
                      <li>• Full game scoring for both teams</li>
                      <li>• Lineup and substitution management</li>
                      <li>• Live box score and stats</li>
                      <li>• Export to PDF and CSV</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Footer hint */}
        <div className="mt-12 text-center text-sm text-slate-500">
          Select a tool above to get started. You can switch between tools anytime.
        </div>
      </div>
    </main>
  );
}
