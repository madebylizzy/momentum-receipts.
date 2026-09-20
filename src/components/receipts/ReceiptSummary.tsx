"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Code2,
  TrendingUp,
  BarChart3,
} from "lucide-react";

export function ReceiptSummary({
  refreshTrigger,
}: {
  refreshTrigger: number;
}) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [rawOutput, setRawOutput] = useState<any | null>(null);
  const [receiptCount, setReceiptCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const handleGenerateSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/receipts/summary", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate financial summary.");
        return;
      }

      setSummary(data.summary);
      setRawOutput(data.rawOutput);
      setReceiptCount(data.receiptCount);
    } catch (err: any) {
      setError(err.message || "Network error while generating summary.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#17201C] flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#C5DED2] to-[#A8D5C0] flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-[#174B37]" />
            </div>
            Cross-Receipt Financial Summary
            <span className="text-[10px] bg-[#C5DED2] text-[#174B37] px-2 py-0.5 rounded-full font-semibold ml-1">
              Role 2
            </span>
          </h2>
          <p className="text-xs text-[#66736D] mt-1 ml-9">
            Generate an AI-powered spending analysis across all processed
            receipts using a distinct financial analyst prompt
          </p>
        </div>

        <button
          onClick={handleGenerateSummary}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2F7D5A] hover:bg-[#256648] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm hover:shadow-md shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <BarChart3 className="w-4 h-4" />
              Generate Summary
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 bg-[#F4D0D0] border border-[#C94A4A]/20 rounded-xl text-sm text-[#7E2525]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* No summary yet */}
      {!summary && !loading && !error && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-[#E8ECEA] flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-7 h-7 text-[#d7deda]" />
          </div>
          <p className="text-sm font-medium text-[#66736D]">
            No summary generated yet
          </p>
          <p className="text-xs text-[#66736D]/70 mt-1">
            Process some receipts, then click &ldquo;Generate Summary&rdquo; for
            financial insights
          </p>
        </div>
      )}

      {/* Summary Result */}
      {summary && (
        <div className="space-y-3">
          {/* Receipt count badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F7D5A] bg-[#C5DED2] px-3 py-1 rounded-full">
              <FileText className="w-3 h-3" />
              Based on {receiptCount} validated receipt
              {receiptCount !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Summary text card */}
          <div className="p-5 bg-white border border-[#d7deda] rounded-xl">
            <div className="text-sm text-[#17201C] whitespace-pre-line leading-relaxed">
              {summary}
            </div>
          </div>

          {/* Raw output toggle */}
          {rawOutput && (
            <div className="bg-white border border-[#d7deda] rounded-xl overflow-hidden">
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-[#66736D] hover:text-[#2F7D5A] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5" />
                  Raw Model Output (Evidence)
                </span>
                {showRaw ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showRaw && (
                <div className="border-t border-[#E8ECEA] p-3 bg-[#17201C]">
                  <pre className="text-[11px] text-[#C5DED2] font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
                    {JSON.stringify(rawOutput, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
