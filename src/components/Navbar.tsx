"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, User, Receipt, Sparkles } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
}

export function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <header className="border-b border-[#d7deda] bg-[#ffffff] sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-[#17201c] tracking-tight">
          <div className="w-9 h-9 rounded-lg bg-[#2F7D5A] flex items-center justify-center text-white shadow-sm">
            <Receipt className="w-5 h-5" />
          </div>
          <span>Momentum Receipts</span>
        </Link>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-8 w-24 bg-[#E8ECEA] animate-pulse rounded-md"></div>
          ) : user ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-[#17201c]">
                <div className="w-7 h-7 rounded-full bg-[#C5DED2] text-[#174B37] flex items-center justify-center font-semibold text-xs">
                  {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
                </div>
                <span className="font-medium hidden sm:inline">{user.name || user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#66736D] hover:text-[#17201c] hover:bg-[#F4F6F5] rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-1.5 text-sm font-medium text-[#2F7D5A] hover:bg-[#C5DED2]/30 rounded-lg transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-3.5 py-1.5 text-sm font-medium bg-[#2F7D5A] text-white hover:bg-[#256548] rounded-lg shadow-sm transition-colors"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
