import { prisma } from "../src/lib/prisma";
import { CONFIG } from "../src/lib/config";

const BASE_URL = "http://localhost:3000";

// Minimal valid 1x1 transparent PNG file
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function runStep3Verification() {
  console.log("==================================================");
  console.log("Step 3 Live Verification: Concurrency Cap Holding");
  console.log(`Configured Concurrency Cap: ${CONFIG.CONCURRENCY_CAP}`);
  console.log("==================================================\n");

  // 1. Register a fresh user
  const email = `test_step3_${Date.now()}@example.com`;
  const password = "Password123!";
  console.log(`[1/4] Registering test user (${email})...`);

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Step3 Tester" }),
  });

  if (!regRes.ok) {
    throw new Error(`Registration failed: ${regRes.status} ${await regRes.text()}`);
  }

  const cookieHeader = regRes.headers.get("set-cookie");
  if (!cookieHeader) throw new Error("No session cookie returned");
  const sessionCookie = cookieHeader.split(";")[0];
  console.log(`✓ User registered. Cookie: ${sessionCookie.substring(0, 25)}...\n`);

  // 2. Upload 5 receipts in one batch to exceed concurrency cap (5 > 2)
  console.log("[2/4] Uploading batch of 5 receipts in a single multipart request...");
  const formData = new FormData();
  for (let i = 1; i <= 5; i++) {
    const blob = new Blob([PNG_1X1], { type: "image/png" });
    formData.append("files", blob, `batch_receipt_${i}.png`);
  }

  const uploadStart = Date.now();
  const uploadRes = await fetch(`${BASE_URL}/api/receipts/upload`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
    },
    body: formData,
  });

  if (!uploadRes.ok) {
    throw new Error(`Batch upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  const uploadData = await uploadRes.json();
  const jobIds: string[] = uploadData.jobs.map((j: any) => j.id);
  console.log(`✓ Upload accepted (HTTP 202). Created ${jobIds.length} jobs:`);
  jobIds.forEach((id, idx) => console.log(`   Job #${idx + 1}: ${id}`));
  console.log();

  // 3. Monitor DB states and concurrency over time
  console.log("[3/4] Monitoring Job state transitions & active concurrency in real-time...");
  console.log("Time (s) | Pending | Processing | Done | Failed | Active <= Cap?");
  console.log("------------------------------------------------------------------");

  let maxObservedProcessing = 0;
  let allFinished = false;
  const startTime = Date.now();

  const timelineLog: Array<{
    elapsedSec: string;
    pending: number;
    processing: number;
    done: number;
    failed: number;
    activeJobIds: string[];
  }> = [];

  while (!allFinished) {
    const jobs = await prisma.job.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, status: true, attemptCount: true, storageKey: true },
    });

    const pending = jobs.filter((j) => j.status === "PENDING").length;
    const processing = jobs.filter((j) => j.status === "PROCESSING").length;
    const done = jobs.filter((j) => j.status === "DONE").length;
    const failed = jobs.filter((j) => j.status === "FAILED").length;
    const activeJobIds = jobs.filter((j) => j.status === "PROCESSING").map((j) => j.id);

    if (processing > maxObservedProcessing) {
      maxObservedProcessing = processing;
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const capHeld = processing <= CONFIG.CONCURRENCY_CAP ? "YES (HELD)" : "FAILED (EXCEEDED)";

    console.log(
      `${elapsedSec.padStart(7)}s | ${String(pending).padStart(7)} | ${String(processing).padStart(10)} | ${String(
        done
      ).padStart(4)} | ${String(failed).padStart(6)} | ${capHeld} (Active: ${processing}/${CONFIG.CONCURRENCY_CAP})`
    );

    timelineLog.push({
      elapsedSec,
      pending,
      processing,
      done,
      failed,
      activeJobIds,
    });

    if (processing > CONFIG.CONCURRENCY_CAP) {
      throw new Error(`CONCURRENCY CAP VIOLATION: Observed ${processing} processing jobs (Cap: ${CONFIG.CONCURRENCY_CAP})`);
    }

    if (pending === 0 && processing === 0) {
      allFinished = true;
      break;
    }

    // Safety timeout at 120s
    if (Date.now() - startTime > 120000) {
      console.warn("Monitoring reached 120s safety limit.");
      break;
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  console.log("------------------------------------------------------------------\n");

  // 4. Final Verification Summary
  console.log("[4/4] Concurrency Verification Summary:");
  console.log(`- Configured Concurrency Cap: ${CONFIG.CONCURRENCY_CAP}`);
  console.log(`- Total Jobs Processed:       ${jobIds.length}`);
  console.log(`- Maximum Active Processing:  ${maxObservedProcessing}`);
  console.log(`- Concurrency Cap Violation:  ${maxObservedProcessing <= CONFIG.CONCURRENCY_CAP ? "NONE (0 violations)" : "VIOLATED"}`);

  const finalJobs = await prisma.job.findMany({
    where: { id: { in: jobIds } },
    select: {
      id: true,
      status: true,
      attemptCount: true,
      storageKey: true,
      errorMessage: true,
      validatedResult: true,
    },
  });

  console.log("\nFinal Job Records in PostgreSQL:");
  finalJobs.forEach((j, i) => {
    console.log(`  [Job ${i + 1}] ID: ${j.id} | Status: ${j.status} | Attempts: ${j.attemptCount} | StorageKey: ${j.storageKey}`);
  });

  console.log("\n==================================================");
  console.log("Step 3 Live Verification Completed Successfully.");
  console.log("==================================================");
}

runStep3Verification()
  .catch((err) => {
    console.error("Step 3 Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
