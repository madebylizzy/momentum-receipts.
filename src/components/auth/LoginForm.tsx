"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, AlertCircle, ArrowRight, Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to sign in. Please check your credentials.");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-8 rounded-2xl border border-[#d7deda] shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-[#17201C] tracking-tight">Sign In</h1>
        <p className="text-sm text-[#66736D] mt-1">
          Access your Momentum Receipts workspace
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3.5 bg-[#F4D0D0] border border-[#C94A4A]/30 text-[#7E2525] rounded-xl text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#C94A4A]" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#66736D] mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#66736D] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full pl-10 pr-3.5 py-2.5 bg-[#F8F7F3] border border-[#d7deda] rounded-xl text-sm text-[#17201C] focus:outline-none focus:ring-2 focus:ring-[#2F7D5A]/40 focus:border-[#2F7D5A] transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#66736D] mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#66736D] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-3.5 py-2.5 bg-[#F8F7F3] border border-[#d7deda] rounded-xl text-sm text-[#17201C] focus:outline-none focus:ring-2 focus:ring-[#2F7D5A]/40 focus:border-[#2F7D5A] transition"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3 bg-[#2F7D5A] text-white font-medium rounded-xl hover:bg-[#256548] focus:outline-none focus:ring-2 focus:ring-[#2F7D5A]/50 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-[#d7deda] text-center text-sm text-[#66736D]">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-[#2F7D5A] hover:underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
