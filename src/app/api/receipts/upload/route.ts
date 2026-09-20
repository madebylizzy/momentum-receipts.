import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { jobWorker } from "@/lib/worker";

// Maximum number of files per single upload request
const MAX_FILES_PER_REQUEST = 10;

export async function POST(request: Request) {
  // 1. Authenticate
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit (cost control against paid DeepSeek API)
  const rateLimitResult = checkRateLimit(
    "upload",
    user.id,
    CONFIG.UPLOAD_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Please wait before uploading more receipts.",
        retryAfterMs: rateLimitResult.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimitResult.retryAfterMs || 0) / 1000)
          ),
        },
      }
    );
  }

  // 3. Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data. Please submit receipt images." },
      { status: 400 }
    );
  }

  const files = formData.getAll("files");
  if (!files || files.length === 0) {
    return NextResponse.json(
      { error: "No files provided. Please select at least one receipt image." },
      { status: 400 }
    );
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many files. Maximum ${MAX_FILES_PER_REQUEST} files per upload.` },
      { status: 400 }
    );
  }

  // 4. Validate each file before accepting any
  const validatedFiles: { file: File; buffer: Buffer }[] = [];

  for (const entry of files) {
    if (!(entry instanceof File)) {
      return NextResponse.json(
        { error: "Invalid file entry in upload." },
        { status: 400 }
      );
    }

    const file = entry as File;

    // Check file type
    if (
      !CONFIG.STORAGE.allowedMimeTypes.includes(
        file.type as (typeof CONFIG.STORAGE.allowedMimeTypes)[number]
      )
    ) {
      return NextResponse.json(
        {
          error: `File "${file.name}" has unsupported type "${file.type}". Allowed: ${CONFIG.STORAGE.allowedMimeTypes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Check file size
    if (file.size > CONFIG.STORAGE.maxFileSizeBytes) {
      const maxMB = (CONFIG.STORAGE.maxFileSizeBytes / (1024 * 1024)).toFixed(0);
      return NextResponse.json(
        {
          error: `File "${file.name}" exceeds the ${maxMB}MB size limit.`,
        },
        { status: 400 }
      );
    }

    // Check for empty files
    if (file.size === 0) {
      return NextResponse.json(
        { error: `File "${file.name}" is empty.` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    validatedFiles.push({ file, buffer: Buffer.from(arrayBuffer) });
  }

  // 5. Ensure upload directory exists
  const uploadDir = path.resolve(process.cwd(), CONFIG.STORAGE.uploadDir);
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  // 6. Write files to disk and create Job records
  const createdJobs: { id: string; storageKey: string; fileName: string }[] = [];

  for (const { file, buffer } of validatedFiles) {
    // Generate a unique storage key — never the original filename
    const ext = path.extname(file.name).toLowerCase() || ".jpg";
    const storageKey = `receipt_${crypto.randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, storageKey);

    // Write to local disk (dev equivalent of object storage)
    await writeFile(filePath, buffer);

    // Create Job record with PENDING status — only storageKey, never file bytes
    const job = await prisma.job.create({
      data: {
        userId: user.id,
        storageKey,
        status: "PENDING",
        attemptCount: 0,
      },
    });

    createdJobs.push({
      id: job.id,
      storageKey: job.storageKey,
      fileName: file.name,
    });
  }

  // 7. Trigger the background worker queue (capped at CONCURRENCY_CAP)
  jobWorker.trigger();

  // 8. Return 202 Accepted immediately — processing happens asynchronously in worker
  return NextResponse.json(
    {
      message: `${createdJobs.length} receipt(s) uploaded and queued for processing.`,
      jobs: createdJobs.map((j) => ({
        id: j.id,
        fileName: j.fileName,
        status: "PENDING",
      })),
    },
    { status: 202 }
  );
}
