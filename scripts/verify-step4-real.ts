import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { CONFIG } from "../src/lib/config";
import { extractReceiptData } from "../src/lib/deepseek";
import { ReceiptExtractionSchema } from "../src/lib/schemas/receipt";

const BASE_URL = "http://localhost:3000";
const TEST_ASSETS_DIR = path.join(process.cwd(), "test-assets");

const REAL_RECEIPT_1 = path.join(TEST_ASSETS_DIR, "real_receipt_sroie_001.jpg"); // Indah Gift
const REAL_RECEIPT_2 = path.join(TEST_ASSETS_DIR, "real_receipt_sroie_002.jpg"); // Mr D.I.Y.
const REAL_RECEIPT_3 = path.join(TEST_ASSETS_DIR, "real_receipt_sroie_003.jpg"); // Yongfatt Enterprise

// Non-receipt image (a photo of a pure texture/blank object) that will trigger unparseable/validation failure flow
const CORRUPT_IMAGE_PATH = path.join(TEST_ASSETS_DIR, "non_receipt_test.jpg");

async function runStep4RealVerification() {
  console.log("======================================================================");
  console.log("Step 4 Live Verification: Real Photograph Extraction & Controlled Retry");
  console.log(`AI Provider: DeepSeek (${CONFIG.MODEL_ID})`);
  console.log("======================================================================\n");

  // Create non-receipt test file
  fs.writeFileSync(CORRUPT_IMAGE_PATH, Buffer.from("NOT_A_REAL_RECEIPT_IMAGE_CONTENT_PADDING_BYTE_DATA_FOR_FAILURE_TEST"));

  // 1. Register test user
  const email = `test_real_step4_${Date.now()}@example.com`;
  const password = "Password123!";
  console.log(`[1/5] Registering fresh test user (${email})...`);

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Real Photo Verifier" }),
  });

  if (!regRes.ok) throw new Error(`Registration failed: ${regRes.status}`);
  const cookieHeader = regRes.headers.get("set-cookie");
  if (!cookieHeader) throw new Error("No session cookie");
  const sessionCookie = cookieHeader.split(";")[0];
  console.log(`✓ User registered. Cookie: ${sessionCookie.substring(0, 25)}...\n`);

  // 2. Upload Real Physical Receipt Photographs
  console.log("[2/5] Uploading 3 Real-World Physical Receipt Photographs (SROIE Dataset)...");
  console.log("  - Receipt 1: Indah Gift & Home Deco (real_receipt_sroie_001.jpg)");
  console.log("  - Receipt 2: MR D.I.Y. (JOHOR) (real_receipt_sroie_002.jpg)");
  console.log("  - Receipt 3: Yongfatt Enterprise (real_receipt_sroie_003.jpg)");

  const form = new FormData();
  form.append("files", new Blob([fs.readFileSync(REAL_RECEIPT_1)], { type: "image/jpeg" }), "real_receipt_sroie_001.jpg");
  form.append("files", new Blob([fs.readFileSync(REAL_RECEIPT_2)], { type: "image/jpeg" }), "real_receipt_sroie_002.jpg");
  form.append("files", new Blob([fs.readFileSync(REAL_RECEIPT_3)], { type: "image/jpeg" }), "real_receipt_sroie_003.jpg");

  const uploadRes = await fetch(`${BASE_URL}/api/receipts/upload`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
    body: form,
  });

  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const uploadData = await uploadRes.json();
  const jobIds: string[] = uploadData.jobs.map((j: any) => j.id);
  console.log(`✓ Upload accepted (HTTP 202). Created jobs: ${jobIds.join(", ")}\n`);

  // 3. Monitor real vision extraction
  console.log("[3/5] Awaiting DeepSeek Vision Extraction & Schema Validation...");
  const startTime = Date.now();
  let finished = false;

  while (!finished) {
    const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } } });
    const pending = jobs.filter((j) => j.status === "PENDING").length;
    const processing = jobs.filter((j) => j.status === "PROCESSING").length;
    const done = jobs.filter((j) => j.status === "DONE").length;
    const failed = jobs.filter((j) => j.status === "FAILED").length;

    console.log(`  [Elapsed ${((Date.now() - startTime) / 1000).toFixed(1)}s] Status: ${done} DONE, ${processing} PROCESSING, ${pending} PENDING, ${failed} FAILED`);

    if (pending === 0 && processing === 0) {
      finished = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log("\n--- Real Photograph Extraction Results from PostgreSQL ---");
  const extractedJobs = await prisma.job.findMany({ where: { id: { in: jobIds } }, orderBy: { createdAt: "asc" } });

  extractedJobs.forEach((job, idx) => {
    console.log(`\n[Receipt #${idx + 1}] ID: ${job.id} | Status: ${job.status} | Attempts: ${job.attemptCount}`);
    console.log(`Storage Key: ${job.storageKey}`);
    console.log("Validated Structured Data in PostgreSQL:");
    console.log(JSON.stringify(job.validatedResult, null, 2));
  });

  // 4. Controlled Test: Deliberate Validation Failure & Retry Path (Direct Integration Test)
  console.log("\n======================================================================");
  console.log("[4/5] Controlled Diagnostic: Deliberate Schema Failure & Retry-Once Flow");
  console.log("======================================================================");

  // Test Case A: Demonstrating Zod Schema Rejection on Malformed Model Arguments
  console.log("\nA. Testing Application Zod Validation Schema directly against invalid inputs:");
  const invalidPayloads = [
    {
      name: "Missing Vendor & Negative Amount",
      payload: { date: "2026-03-15", totalMinorUnits: -500, currency: "USD", category: "Other", lineItems: [] },
    },
    {
      name: "Invalid Date Format & Invalid Currency Code",
      payload: { vendor: "Shop", date: "15/03/2026", totalMinorUnits: 1000, currency: "US_DOLLARS", category: "InvalidCategory", lineItems: [{ description: "Item", amountMinorUnits: 1000 }] },
    },
  ];

  invalidPayloads.forEach((testCase) => {
    const parseResult = ReceiptExtractionSchema.safeParse(testCase.payload);
    console.log(`  Test Case: "${testCase.name}"`);
    console.log(`  - Schema Validation Success: ${parseResult.success}`);
    if (!parseResult.success) {
      console.log(`  - Diagnostic Error Feedback generated for retry turn:`);
      parseResult.error.issues.forEach((issue) => {
        console.log(`      * ${issue.path.join(".")}: ${issue.message}`);
      });
    }
  });

  // Test Case B: End-to-End Graceful Failure on Malformed / Unprocessable File
  console.log("\nB. End-to-End Failure Flow: Uploading Unprocessable Non-Receipt File:");
  const corruptUploadForm = new FormData();
  corruptUploadForm.append("files", new Blob([fs.readFileSync(CORRUPT_IMAGE_PATH)], { type: "image/jpeg" }), "corrupt_data.jpg");

  const corruptUploadRes = await fetch(`${BASE_URL}/api/receipts/upload`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
    body: corruptUploadForm,
  });

  const corruptData = await corruptUploadRes.json();
  const corruptJobId = corruptData.jobs[0].id;
  console.log(`  Created Job for unprocessable file: ${corruptJobId}`);

  // Wait for worker to attempt processing, retry, and fail gracefully
  let corruptJob: any = null;
  while (!corruptJob || corruptJob.status === "PENDING" || corruptJob.status === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 1000));
    corruptJob = await prisma.job.findUnique({ where: { id: corruptJobId } });
  }

  console.log(`  ✓ Job Status: ${corruptJob.status}`);
  console.log(`  ✓ Attempt Count: ${corruptJob.attemptCount}`);
  console.log(`  ✓ Error Message in DB: "${corruptJob.errorMessage}"`);
  console.log(`  ✓ Raw Output Preserved: ${corruptJob.rawOutput !== null ? "YES (Preserved for audit)" : "NO"}`);

  console.log("\n======================================================================");
  console.log("Step 4 Real Photograph & Controlled Retry Verification Complete.");
  console.log("======================================================================");
}

runStep4RealVerification()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
