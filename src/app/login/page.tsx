"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type Session } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Unknown error";
}

function AlertBox({
  variant,
  title,
  message,
}: {
  variant: "error" | "success" | "warning";
  title: string;
  message: string;
}) {
  const styles =
    variant === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : variant === "success"
        ? "border-green-200 bg-green-50 text-green-900"
        : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className={`rounded-lg border p-3 text-sm ${styles}`}>
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-[13px] leading-relaxed">{message}</div>
    </div>
  );
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
  const [previewOk, setPreviewOk] = useState(true);

  const canSubmit = useMemo(() => {
    return Boolean(authEmail) && Boolean(authPassword) && !authBusy;
  }, [authEmail, authPassword, authBusy]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error);
        return;
      }
      setSession(data.session ?? null);
      if (data.session) router.replace("/home");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) router.replace("/home");
    });

    return () => {
      sub?.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (session) router.replace("/home");
  }, [session, router]);

  async function signUp() {
    setAuthError(null);
    setResetMessage(null);

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
      setResetMessage("Account created. If email confirmation is enabled, check your inbox to confirm.");
    } catch (e: unknown) {
      setAuthError(getErrorMessage(e) || "Sign up failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signIn() {
    setAuthError(null);
    setResetMessage(null);

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
      router.replace("/home");
    } catch (e: unknown) {
      setAuthError(getErrorMessage(e) || "Sign in failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resetPassword() {
    setAuthError(null);
    setResetMessage(null);

    if (!authEmail) {
      setAuthError("Enter your email first, then click Forgot password again.");
      return;
    }
    if (!supabase) {
      setAuthError("Supabase is not configured. Ensure app/.env.local has keys, then restart npm run dev.");
      return;
    }

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
        <div className="w-full max-w-lg">
          <AlertBox
            variant="warning"
            title="Supabase is not configured"
            message="Ensure app/.env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart npm run dev."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="min-h-screen grid lg:grid-cols-2 items-start">
        {/* Left side: app info */}
        <section className="relative flex items-start justify-center p-6 lg:p-10">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white" />
          <div className="relative w-full max-w-xl pt-6 pb-10">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">
                <span className="font-medium text-slate-900">Bullpen Tracker</span>
                <span className="text-slate-400">•</span>
                <span>Pitch logging and review</span>
              </div>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Log bullpen sessions. Track command. Review pitch execution.
            </h1>
            <p className="mt-2 max-w-lg text-slate-600 leading-relaxed">
              Built for pitchers and coaches to log every pitch, compare intended vs actual location, and review command over time.
            </p>

            <div className="mt-6 grid gap-4">
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-900">Built for bullpens</div>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  <li>• Log pitch type, intent, and result</li>
                  <li>• Compare intended vs actual location</li>
                  <li>• Organize bullpen sessions by pitcher and date</li>
                  <li>• Tag pitches for video review</li>
                  <li>• Track command trends over time</li>
                </ul>
              </div>

              <div className="relative rounded-xl">
                <div className="absolute inset-0 rounded-xl bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
                <div className="relative z-10 rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm font-medium text-slate-900 mb-2">
                    Live app preview
                  </div>

                  <div className="group relative overflow-hidden rounded-xl border bg-white shadow-sm ring-1 ring-slate-200/60 transition-all duration-200 hover:shadow-md">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-white/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    <div className="overflow-hidden max-h-[340px]">
                      <img
                        src="/main-page.png"
                        alt="Bullpen Tracker main page preview"
                        className="w-full h-auto object-contain transition-transform duration-300 group-hover:scale-[1.005]"
                        onLoad={() => setPreviewOk(true)}
                        onError={() => setPreviewOk(false)}
                      />
                    </div>

                    {!previewOk && (
                      <div className="flex items-center justify-center px-4 py-10 text-sm text-slate-500">
                        Main dashboard showing pitchers, sessions, and pitch details.
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Dashboard preview</span>
                    <span className="rounded-full border bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                      Real app screenshot
                    </span>
                  </div>

                  <div className="mt-2 grid gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-white text-[11px] font-medium">
                        1
                      </span>
                      <span>Select a pitcher and a session</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-white text-[11px] font-medium">
                        2
                      </span>
                      <span>Log pitches with location and tags</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-white text-[11px] font-medium">
                        3
                      </span>
                      <span>Review Session Summary and trends</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-900">Privacy</div>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Your data stays in your account. Nothing is public by default.
                </p>
              </div>
            </div>

            <div className="mt-8 text-xs text-slate-500">
              Tip: Use a dedicated email for your coaching organization if multiple coaches will share access later.
            </div>
          </div>
        </section>

        {/* Right side: login card */}
        <section className="flex items-start justify-center p-6 lg:p-10 bg-slate-50 lg:bg-white">
          <div className="w-full max-w-md pt-16">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{session ? "You’re signed in" : "Sign in to your bullpen tracker"}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {session ? (
                  <>
                    <div className="text-sm text-slate-700">
                      Signed in as <span className="font-medium">{session.user.email}</span>
                    </div>
                    <Button onClick={() => router.push("/home")}>Go to app</Button>
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
                            setAuthError(null);
                          }}
                          placeholder="you@email.com"
                          type="email"
                          autoComplete="email"
                        />
                      </div>

                      <div>
                        <Label className="block text-sm font-medium mb-1">Password</Label>
                        <Input
                          value={authPassword}
                          onChange={(e) => {
                            setAuthPassword(e.target.value);
                            setAuthError(null);
                          }}
                          placeholder="Your password"
                          type="password"
                          autoComplete="current-password"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={signIn} disabled={!canSubmit}>
                          {authBusy ? "Signing in..." : "Sign in"}
                        </Button>
                        <Button variant="outline" onClick={signUp} disabled={!canSubmit}>
                          {authBusy ? "Working..." : "Sign up"}
                        </Button>
                      </div>

                      <div className="text-xs text-slate-500">
                        You will be redirected to the app after signing in.
                      </div>

                      <button
                        type="button"
                        className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900"
                        onClick={resetPassword}
                        disabled={authBusy}
                      >
                        Forgot password?
                      </button>
                    </div>

                    {authError && <AlertBox variant="error" title="Could not sign in" message={authError} />}
                    {resetMessage && <AlertBox variant="success" title="Success" message={resetMessage} />}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="mt-4 text-center text-xs text-slate-500">
              Having trouble? Try resetting your password or verify your email if confirmations are enabled.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
