"use client";

import { useState } from "react";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Receipt,
  Tag,
  Calendar,
  Store,
  Code2,
  ShoppingBag,
  AlertCircle,
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

const statusConfig = {
  PENDING: {
    label: "Queued",
    icon: Clock,
    color: "text-[#C9852B]",
    bg: "bg-[#F4DEB9]",
    border: "border-[#C9852B]/20",
    dotColor: "bg-[#C9852B]",
  },
  PROCESSING: {
    label: "Processing",
    icon: Loader2,
    color: "text-[#2F7D5A]",
    bg: "bg-[#C5DED2]",
    border: "border-[#2F7D5A]/20",
    dotColor: "bg-[#2F7D5A]",
  },
  DONE: {
    label: "Complete",
    icon: CheckCircle2,
    color: "text-[#2F7D5A]",
    bg: "bg-[#C5DED2]",
    border: "border-[#2F7D5A]/20",
    dotColor: "bg-[#2F7D5A]",
  },
  FAILED: {
    label: "Failed",
    icon: XCircle,
    color: "text-[#C94A4A]",
    bg: "bg-[#F4D0D0]",
    border: "border-[#C94A4A]/20",
    dotColor: "bg-[#C94A4A]",
  },
};

// Category colors for expense card badges
const categoryColors: Record<string, { bg: string; text: string }> = {
  "Meals & Entertainment": { bg: "bg-[#F0E6D9]", text: "text-[#8B6914]" },
  "Office Supplies": { bg: "bg-[#D9E8F0]", text: "text-[#2B5E80]" },
  "Travel & Transport": { bg: "bg-[#E0D9F0]", text: "text-[#5B2B80]" },
  "Utilities": { bg: "bg-[#D9F0E6]", text: "text-[#2B8060]" },
  "Software & Subscriptions": { bg: "bg-[#F0D9E8]", text: "text-[#802B5E]" },
  "Retail & Shopping": { bg: "bg-[#F0EAD9]", text: "text-[#806B2B]" },
  "Groceries & Food": { bg: "bg-[#E8F0D9]", text: "text-[#5E802B]" },
  "Healthcare": { bg: "bg-[#D9F0F0]", text: "text-[#2B7A80]" },
  "Other": { bg: "bg-[#E8ECEA]", text: "text-[#66736D]" },
};

function ExpenseCard({ job }: { job: Job }) {
  const [showAudit, setShowAudit] = useState(false);
  const cfg = statusConfig[job.status];
  const StatusIcon = cfg.icon;
  const result = job.validatedResult as any;
  const catColor = result?.category
    ? categoryColors[result.category] || categoryColors["Other"]
    : categoryColors["Other"];

  return (
    <div className="bg-white border border-[#d7deda] rounded-xl overflow-hidden hover:shadow-md transition-shadow duration-200">
      {/* Card Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          {/* Status Badge */}
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} ${
                job.status === "PROCESSING" ? "animate-pulse" : ""
              }`}
            />
            {cfg.label}
          </span>

          {/* Attempt counter */}
          <span className="text-[10px] text-[#66736D] font-medium tabular-nums">
            {job.attemptCount > 0 ? `Attempt ${job.attemptCount}` : ""}
          </span>
        </div>

        {/* DONE state: expense details */}
        {job.status === "DONE" && result && (
          <div className="mt-3 space-y-3">
            {/* Vendor & Total */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Store className="w-3.5 h-3.5 text-[#66736D]" />
                <h3 className="text-sm font-bold text-[#17201C] truncate">
                  {result.vendor}
                </h3>
              </div>
              <p className="text-2xl font-bold text-[#17201C] tracking-tight">
                {result.currency}{" "}
                {(result.totalMinorUnits / 100).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#66736D]">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {result.date}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${catColor.bg} ${catColor.text}`}
              >
                <Tag className="w-3 h-3" />
                {result.category}
              </span>
            </div>

            {/* Line Items */}
            {result.lineItems?.length > 0 && (
              <div className="border-t border-[#E8ECEA] pt-2">
                <p className="text-[10px] uppercase tracking-wider text-[#66736D] font-semibold mb-1.5">
                  Line Items
                </p>
                <div className="space-y-1">
                  {result.lineItems.map((item: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-[#17201C] truncate flex-1 mr-2">
                        <ShoppingBag className="w-3 h-3 inline mr-1 text-[#66736D]" />
                        {item.description}
                        {item.quantity > 1 && (
                          <span className="text-[#66736D]">
                            {" "}
                            ×{item.quantity}
                          </span>
                        )}
                      </span>
                      <span className="text-[#17201C] font-medium tabular-nums whitespace-nowrap">
                        {(item.amountMinorUnits / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PENDING / PROCESSING state */}
        {(job.status === "PENDING" || job.status === "PROCESSING") && (
          <div className="mt-3">
            <p className="text-xs text-[#66736D] truncate flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" />
              {job.storageKey}
            </p>
            {job.status === "PROCESSING" && (
              <div className="mt-2 h-1 bg-[#E8ECEA] rounded-full overflow-hidden">
                <div className="h-full bg-[#2F7D5A] rounded-full animate-pulse w-2/3" />
              </div>
            )}
          </div>
        )}

        {/* FAILED state */}
        {job.status === "FAILED" && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-[#66736D] truncate flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" />
              {job.storageKey}
            </p>
            {job.errorMessage && (
              <div className="p-2.5 bg-[#F4D0D0] border border-[#C94A4A]/15 rounded-lg">
                <p className="text-xs text-[#7E2525] flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="line-clamp-3">{job.errorMessage}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Footer: timestamp + audit toggle */}
      <div className="px-4 py-2.5 bg-[#FAFBFA] border-t border-[#E8ECEA] flex items-center justify-between">
        <span className="text-[10px] text-[#66736D] tabular-nums">
          {new Date(job.createdAt).toLocaleString()}
        </span>

        {/* Raw Audit Viewer toggle — only for DONE/FAILED jobs with rawOutput */}
        {(job.status === "DONE" || job.status === "FAILED") && job.rawOutput && (
          <button
            onClick={() => setShowAudit(!showAudit)}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-[#66736D] hover:text-[#2F7D5A] transition-colors"
          >
            <Code2 className="w-3 h-3" />
            {showAudit ? "Hide" : "Raw Output"}
            {showAudit ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Raw Audit Viewer Panel */}
      {showAudit && job.rawOutput && (
        <div className="border-t border-[#E8ECEA] p-3 bg-[#17201C]">
          <div className="flex items-center gap-1.5 mb-2">
            <Code2 className="w-3 h-3 text-[#66736D]" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#66736D]">
              Raw Model Output (Evidence)
            </span>
          </div>
          <pre className="text-[11px] text-[#C5DED2] font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
            {JSON.stringify(job.rawOutput, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function JobsList({
  jobs,
  onRefresh,
}: {
  jobs: Job[];
  onRefresh: () => void;
}) {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-[#E8ECEA] flex items-center justify-center mx-auto mb-4">
          <FileText className="w-7 h-7 text-[#d7deda]" />
        </div>
        <p className="text-sm font-medium text-[#66736D]">
          No receipts uploaded yet
        </p>
        <p className="text-xs text-[#66736D]/70 mt-1">
          Upload a receipt image from the Upload tab to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[#17201C]">
          Your Expenses
          <span className="text-xs font-normal text-[#66736D] ml-2">
            {jobs.length} receipt{jobs.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#66736D] hover:text-[#17201C] hover:bg-[#F4F6F5] rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Card Grid Gallery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map((job) => (
          <ExpenseCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
