"use client";

import { useState, useEffect, useCallback } from "react";
import { ReceiptUploader } from "@/components/receipts/ReceiptUploader";
import { JobsList } from "@/components/receipts/JobsList";
import { ReceiptSummary } from "@/components/receipts/ReceiptSummary";
import {
  Upload,
  LayoutGrid,
  Sparkles,
  FileCheck,
  Clock,
  XCircle,
  Wallet,
} from "lucide-react";

interface Job {
  id: string;
  storageKey: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  attemptCount: number;
  errorMessage: string | null;
  rawOutput: any;
  validatedResult: any;
  createdAt: string;
  updatedAt: string;
}

type TabKey = "upload" | "gallery" | "summary";

export default function DashboardPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("upload");
  const [jobs, setJobs] = useState<Job[]>([]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/receipts/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs, refreshTrigger]);

  // Auto-poll when jobs are pending/processing
  useEffect(() => {
    const hasPending = jobs.some(
      (j) => j.status === "PENDING" || j.status === "PROCESSING"
    );
    if (!hasPending) return;
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  // Stats
  const doneJobs = jobs.filter((j) => j.status === "DONE");
  const pendingJobs = jobs.filter(
    (j) => j.status === "PENDING" || j.status === "PROCESSING"
  );
  const failedJobs = jobs.filter((j) => j.status === "FAILED");

  const totalSpending = doneJobs.reduce((sum, j) => {
    const result = j.validatedResult as any;
    return sum + (result?.totalMinorUnits ?? 0);
  }, 0);

  // Detect primary currency from most recent done job
  const primaryCurrency =
    (doneJobs[0]?.validatedResult as any)?.currency || "USD";

  const tabs: { key: TabKey; label: string; icon: typeof Upload }[] = [
    { key: "upload", label: "Upload", icon: Upload },
    { key: "gallery", label: "Expense Gallery", icon: LayoutGrid },
    { key: "summary", label: "AI Summary", icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#17201C] tracking-tight">
          Receipt Processing
        </h1>
        <p className="text-sm text-[#66736D] mt-1">
          Upload receipt images for AI-powered expense extraction and financial
          insights
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#d7deda] rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#C5DED2] flex items-center justify-center shrink-0">
            <FileCheck className="w-5 h-5 text-[#174B37]" />
          </div>
          <div>
            <p className="text-xs text-[#66736D] font-medium">Processed</p>
            <p className="text-xl font-bold text-[#17201C]">
              {doneJobs.length}
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#d7deda] rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F4DEB9] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-[#8B6914]" />
          </div>
          <div>
            <p className="text-xs text-[#66736D] font-medium">In Queue</p>
            <p className="text-xl font-bold text-[#17201C]">
              {pendingJobs.length}
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#d7deda] rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F4D0D0] flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5 text-[#C94A4A]" />
          </div>
          <div>
            <p className="text-xs text-[#66736D] font-medium">Failed</p>
            <p className="text-xl font-bold text-[#17201C]">
              {failedJobs.length}
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#d7deda] rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C5DED2] to-[#A8D5C0] flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-[#174B37]" />
          </div>
          <div>
            <p className="text-xs text-[#66736D] font-medium">Total Spent</p>
            <p className="text-xl font-bold text-[#17201C]">
              {(totalSpending / 100).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-xs font-medium text-[#66736D]">
                {primaryCurrency}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border border-[#d7deda] rounded-xl">
        <div className="flex border-b border-[#E8ECEA]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all relative
                  ${
                    isActive
                      ? "text-[#2F7D5A]"
                      : "text-[#66736D] hover:text-[#17201C]"
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2F7D5A] rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {activeTab === "upload" && (
            <ReceiptUploader
              onUploadComplete={() => {
                setRefreshTrigger((n) => n + 1);
                // Auto-switch to gallery after upload
                setTimeout(() => setActiveTab("gallery"), 500);
              }}
            />
          )}

          {activeTab === "gallery" && (
            <JobsList jobs={jobs} onRefresh={fetchJobs} />
          )}

          {activeTab === "summary" && (
            <ReceiptSummary refreshTrigger={refreshTrigger} />
          )}
        </div>
      </div>
    </div>
  );
}
