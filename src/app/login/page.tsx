"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type Session } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Unknown error";
}

export default function LoginPage() {
  const router = useRouter();
  const supabaseReady = Boolean(supabase);

  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error);
        return;
      }
      setSession(data.session ?? null);
      if (data.session) {
        router.replace("/");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        router.replace("/");
      }
    });

    return () => {
      sub?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      router.replace("/");
    }
  }, [session, router]);

  async function signUp() {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Supabase is not configured. Ensure app/.env.local has keys, then restart npm run dev.");
      return;
    }
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      alert("Signed up. If email confirmation is enabled, check your email.");
    } catch (e: unknown) {
      setAuthError(getErrorMessage(e) || "Sign up failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signIn() {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Supabase is not configured. Ensure app/.env.local has keys, then restart npm run dev.");
      return;
    }
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      router.replace("/");
    } catch (e: unknown) {
      setAuthError(getErrorMessage(e) || "Sign in failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resetPassword() {
    if (!authEmail) {
      alert("Enter your email first.");
      return;
    }
    if (!supabase) {
      setAuthError("Supabase is not configured. Ensure app/.env.local has keys, then restart npm run dev.");
      return;
    }

    setAuthError(null);
    setResetMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetMessage("Password reset email sent. Check your inbox.");
    } catch (e: unknown) {
      setAuthError(getErrorMessage(e) || "Password reset failed");
    }
  }

  if (!supabaseReady) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Supabase is not configured yet. Ensure <span className="font-mono">app/.env.local</span> has{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, then restart{" "}
          <span className="font-mono">npm run dev</span>.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {session ? (
            <>
              <div className="text-sm text-gray-700">
                Signed in as <span className="font-medium">{session.user.email}</span>
              </div>
              <Button onClick={() => router.push("/")}>Go to app</Button>
            </>
          ) : (
            <>
              <div className="grid gap-3">
                <div>
                  <Label className="block text-sm font-medium mb-1">Email</Label>
                  <Input
                    value={authEmail}
                    onChange={(e) => {
                      setAuthEmail(e.target.value);
                      setResetMessage(null);
                    }}
                    placeholder="you@email.com"
                    type="email"
                  />
                </div>
                <div>
                  <Label className="block text-sm font-medium mb-1">Password</Label>
                  <Input
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="password"
                    type="password"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={signIn} disabled={authBusy || !authEmail || !authPassword}>
                    Sign in
                  </Button>
                  <Button variant="outline" onClick={signUp} disabled={authBusy || !authEmail || !authPassword}>
                    Sign up
                  </Button>
                </div>
                <div className="text-sm text-gray-500 text-center">
                  You will be redirected to the app after signing in.
                </div>
                <button
                  type="button"
                  className="text-sm text-gray-500 text-center underline underline-offset-4 hover:text-gray-700"
                  onClick={resetPassword}
                >
                  Forgot password?
                </button>
              </div>

              {authError && <div className="text-sm text-red-600">{authError}</div>}
              {resetMessage && <div className="text-sm text-green-600">{resetMessage}</div>}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
