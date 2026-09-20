"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  X,
  FileImage,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ImagePlus,
} from "lucide-react";
import { CONFIG } from "@/lib/config";

interface UploadedJob {
  id: string;
  fileName: string;
  status: string;
}

interface UploadResult {
  message: string;
  jobs: UploadedJob[];
}

export function ReceiptUploader({
  onUploadComplete,
}: {
  onUploadComplete?: () => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const maxSizeMB = CONFIG.STORAGE.maxFileSizeBytes / (1024 * 1024);
  const allowedExtensions = CONFIG.STORAGE.allowedMimeTypes
    .map((t) => {
      const ext = t.split("/")[1];
      return ext === "jpeg" ? ".jpg/.jpeg" : `.${ext}`;
    })
    .join(", ");

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!CONFIG.STORAGE.allowedMimeTypes.includes(file.type as any)) {
        return `"${file.name}" is not a supported image type. Allowed: ${allowedExtensions}`;
      }
      if (file.size > CONFIG.STORAGE.maxFileSizeBytes) {
        return `"${file.name}" exceeds the ${maxSizeMB}MB size limit.`;
      }
      if (file.size === 0) {
        return `"${file.name}" is empty.`;
      }
      return null;
    },
    [allowedExtensions, maxSizeMB]
  );

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError(null);
      setResult(null);
      const filesToAdd: File[] = [];

      for (const file of Array.from(newFiles)) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }
        filesToAdd.push(file);
      }

      setSelectedFiles((prev) => {
        const combined = [...prev, ...filesToAdd];
        if (combined.length > 10) {
          setError("Maximum 10 files per upload.");
          return prev;
        }
        return combined;
      });
    },
    [validateFile]
  );

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("files", file);
      }

      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(
            data.error ||
              "Rate limit exceeded. Please wait a moment before uploading."
          );
        } else {
          setError(data.error || "Upload failed. Please try again.");
        }
        setUploading(false);
        return;
      }

      setResult(data);
      setSelectedFiles([]);
      if (onUploadComplete) onUploadComplete();
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
          transition-all duration-200
          ${
            dragOver
              ? "border-[#2F7D5A] bg-[#C5DED2]/20 scale-[1.005] shadow-lg shadow-[#2F7D5A]/10"
              : "border-[#d7deda] hover:border-[#2F7D5A]/50 hover:bg-[#F4F6F5]"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={CONFIG.STORAGE.allowedMimeTypes.join(",")}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-4">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-200 ${
              dragOver
                ? "bg-[#2F7D5A] text-white"
                : "bg-[#C5DED2] text-[#174B37]"
            }`}
          >
            <ImagePlus className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#17201C]">
              {dragOver
                ? "Drop your receipts here"
                : "Drop receipt images here or click to browse"}
            </p>
            <p className="text-xs text-[#66736D] mt-1.5">
              {allowedExtensions} · Max {maxSizeMB}MB per file · Up to 10 files
              per batch
            </p>
          </div>
        </div>
      </div>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="bg-white border border-[#d7deda] rounded-xl divide-y divide-[#E8ECEA]">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 px-4 py-3 group"
            >
              <div className="w-8 h-8 rounded-lg bg-[#C5DED2] flex items-center justify-center shrink-0">
                <FileImage className="w-4 h-4 text-[#2F7D5A]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#17201C] truncate">
                  {file.name}
                </p>
                <p className="text-xs text-[#66736D]">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="p-1.5 hover:bg-[#F4D0D0] rounded-lg transition-colors opacity-50 group-hover:opacity-100"
              >
                <X className="w-3.5 h-3.5 text-[#C94A4A]" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3.5 bg-[#F4D0D0] border border-[#C94A4A]/20 text-[#7E2525] rounded-xl text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#C94A4A]" />
          <span>{error}</span>
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="p-3.5 bg-[#C5DED2] border border-[#2F7D5A]/20 text-[#174B37] rounded-xl text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#2F7D5A]" />
          <span>{result.message}</span>
        </div>
      )}

      {/* Upload Button */}
      {selectedFiles.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full py-3.5 bg-[#2F7D5A] text-white font-semibold rounded-xl hover:bg-[#256548] focus:outline-none focus:ring-2 focus:ring-[#2F7D5A]/50 focus:ring-offset-2 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm hover:shadow-md"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Uploading {selectedFiles.length} file(s)...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>
                Upload {selectedFiles.length} Receipt
                {selectedFiles.length > 1 ? "s" : ""}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
