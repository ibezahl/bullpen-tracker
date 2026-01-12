"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoaded(true);
      setSession(null);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoaded(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      sub?.subscription.unsubscribe();
    };
  }, []);

  // If not signed in, force /login (but allow visiting /login)
  useEffect(() => {
    if (!loaded) return;
    if (pathname === "/login" && session) {
      router.replace("/");
      return;
    }
    if (pathname === "/login") return;

    if (!session) {
      router.replace("/login");
    }
  }, [loaded, session, pathname, router]);

  // While checking session, show a simple loading screen everywhere except /login
  if (pathname !== "/login" && !loaded) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-4 w-56 rounded-md bg-gray-200 animate-pulse" />
        <div className="h-4 w-72 rounded-md bg-gray-200 animate-pulse" />
        <div className="h-4 w-40 rounded-md bg-gray-200 animate-pulse" />
      </div>
    );
  }

  // If not signed in and not on /login, show nothing while redirecting
  if (pathname !== "/login" && loaded && !session) {
    return null;
  }

  return <>{children}</>;
}
