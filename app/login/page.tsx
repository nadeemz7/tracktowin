"use client";

import Head from "next/head";
import { useEffect, useState } from "react";

type AuthAction = "login" | "register";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<null | AuthAction>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirm, setRegisterConfirm] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerBusy, setRegisterBusy] = useState(false);

  useEffect(() => {
    if (error && username.trim() && password.trim()) {
      setError("");
    }
  }, [error, username, password]);

  async function handleAuth(action: AuthAction) {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      setError("Email and password are required.");
      return;
    }

    setError("");
    setBusy(action);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedUsername,
          password: trimmedPassword,
          action,
        }),
        redirect: "follow",
      });

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      const payload = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setError(payload?.message || "Invalid email or password");
        return;
      }

      window.location.href = "/people";
    } catch {
      setError(action === "register" ? "User creation failed. Please try again." : "Login failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleAuth("login");
  };

  const closeRegisterModal = () => {
    setRegisterOpen(false);
    setRegisterFirstName("");
    setRegisterLastName("");
    setRegisterEmail("");
    setRegisterPassword("");
    setRegisterConfirm("");
    setRegisterError("");
    setRegisterBusy(false);
  };

  const handleRegister = async () => {
    const trimmedFirstName = registerFirstName.trim();
    const trimmedLastName = registerLastName.trim();
    const trimmedEmail = registerEmail.trim();
    const trimmedPassword = registerPassword.trim();
    const trimmedConfirm = registerConfirm.trim();

    if (!trimmedFirstName || !trimmedLastName) {
      setRegisterError("First and last name are required.");
      return;
    }

    if (!trimmedEmail || !trimmedPassword || !trimmedConfirm) {
      setRegisterError("All fields are required.");
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setRegisterError("Passwords do not match.");
      return;
    }

    setRegisterError("");
    setRegisterBusy(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedEmail,
          password: trimmedPassword,
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          action: "register",
        }),
        redirect: "follow",
      });

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      const payload = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setRegisterError(payload?.message || "User creation failed. Please try again.");
        return;
      }

      setUsername(trimmedEmail);
      const nextUrl = typeof payload?.next === "string" && payload.next ? payload.next : "/people";
      window.location.href = nextUrl;
    } catch {
      setRegisterError("User creation failed. Please try again.");
    } finally {
      setRegisterBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <Head>
        <title>Login | TrackToWin</title>
        <meta name="description" content="Login to TrackToWin" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white border border-gray-200 shadow-lg rounded-xl p-6 flex flex-col gap-6"
      >
        <div className="text-xl font-bold text-slate-900">Sign in</div>

        <label className="flex flex-col gap-2 text-sm text-slate-600">
          Email
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your email"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoComplete="email"
            disabled={busy !== null}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-600">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoComplete="current-password"
            disabled={busy !== null}
          />
        </label>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className="mt-1 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={busy !== null}
          >
            {busy === "login" ? "Signing in..." : "Submit"}
          </button>

          <button
            type="button"
            onClick={() => {
              setRegisterFirstName("");
              setRegisterLastName("");
              setRegisterEmail("");
              setRegisterPassword("");
              setRegisterConfirm("");
              setRegisterError("");
              setRegisterOpen(true);
            }}
            className="rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={busy !== null}
          >
            Create New User
          </button>
        </div>
      </form>

      {registerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">Create account</div>
              <button
                type="button"
                onClick={closeRegisterModal}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
                disabled={registerBusy}
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm text-slate-600">
                First name
                <input
                  type="text"
                  value={registerFirstName}
                  onChange={(event) => {
                    setRegisterFirstName(event.target.value);
                    if (registerError) setRegisterError("");
                  }}
                  placeholder="Enter your first name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="given-name"
                  required
                  disabled={registerBusy}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-600">
                Last name
                <input
                  type="text"
                  value={registerLastName}
                  onChange={(event) => {
                    setRegisterLastName(event.target.value);
                    if (registerError) setRegisterError("");
                  }}
                  placeholder="Enter your last name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="family-name"
                  required
                  disabled={registerBusy}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-600">
                Email
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(event) => {
                    setRegisterEmail(event.target.value);
                    if (registerError) setRegisterError("");
                  }}
                  placeholder="Enter your email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="email"
                  disabled={registerBusy}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-600">
                Password
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(event) => {
                    setRegisterPassword(event.target.value);
                    if (registerError) setRegisterError("");
                  }}
                  placeholder="Create a password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="new-password"
                  disabled={registerBusy}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-600">
                Confirm Password
                <input
                  type="password"
                  value={registerConfirm}
                  onChange={(event) => {
                    setRegisterConfirm(event.target.value);
                    if (registerError) setRegisterError("");
                  }}
                  placeholder="Confirm your password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="new-password"
                  disabled={registerBusy}
                />
              </label>

              {registerError ? <div className="text-sm text-red-600">{registerError}</div> : null}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleRegister}
                  className="rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={registerBusy}
                >
                  {registerBusy ? "Creating..." : "Create Account"}
                </button>
                <button
                  type="button"
                  onClick={closeRegisterModal}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={registerBusy}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
