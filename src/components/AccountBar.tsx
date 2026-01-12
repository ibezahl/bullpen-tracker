"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { type Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabaseClient";

export default function AccountBar() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      sub?.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-end gap-3 rounded-xl border bg-white px-3 py-2 shadow-sm pointer-events-auto">
        <div className="text-sm text-gray-700 truncate max-w-[220px]">
          Signed in as{" "}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-medium cursor-default">{session.user.email}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{session.user.email}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button variant="outline" onClick={signOut} disabled={busy}>
          Log out
        </Button>
      </div>
    </div>
  );
}
