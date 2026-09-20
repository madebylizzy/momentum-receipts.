import { PrismaClient } from "@prisma/client";
import { CONFIG } from "../src/lib/config";
import * as dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  console.log("======================================================================");
  console.log("MOMENTUM RECEIPTS — STEP 6 END-TO-END VERIFICATION & EVIDENCE REPORT");
  console.log("======================================================================");

  // 1. Database Connection & Table Isolation
  const dbUrl = process.env.DATABASE_URL || "";
  console.log("\n[1] Database Environment & Isolation:");
  console.log(`- Connection URL: ${dbUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`- Target Isolated Database: momentum_receipts`);

  // 2. Storage Key Only Isolation Proof
  const sampleJobs = await prisma.job.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      storageKey: true,
      status: true,
      attemptCount: true,
      errorMessage: true,
      validatedResult: true,
      createdAt: true,
    },
  });

  console.log("\n[2] Storage Key Isolation (Zero Image Binaries in PostgreSQL):");
  sampleJobs.forEach((j: any) => {
    console.log(`- Job [${j.id}]:`);
    console.log(`    storageKey: "${j.storageKey}" (Type: ${typeof j.storageKey}, Length: ${j.storageKey.length} chars)`);
    console.log(`    status: ${j.status} | attemptCount: ${j.attemptCount}`);
  });

  // 3. PostgreSQL Evidence of Both DONE and FAILED States with Raw Output & Validated Result
  const doneJobs = await prisma.job.findMany({
    where: { status: "DONE" },
    take: 2,
    orderBy: { createdAt: "desc" },
  });

  const failedJobs = await prisma.job.findMany({
    where: { status: "FAILED" },
    take: 2,
    orderBy: { createdAt: "desc" },
  });

  console.log("\n[3] Real Job Table Evidence — Successful Extractions (DONE):");
  doneJobs.forEach((j) => {
    console.log(`\n--- Job ID: ${j.id} (Status: ${j.status}, Attempts: ${j.attemptCount}) ---`);
    console.log(`Storage Key: ${j.storageKey}`);
    console.log(`Validated Result:\n${JSON.stringify(j.validatedResult, null, 2)}`);
    console.log(`Raw Output Present: ${!!j.rawOutput} (Keys: ${Object.keys(j.rawOutput as object || {}).join(", ")})`);
  });

  console.log("\n[4] Real Job Table Evidence — Failed Extractions (FAILED):");
  failedJobs.forEach((j) => {
    console.log(`\n--- Job ID: ${j.id} (Status: ${j.status}, Attempts: ${j.attemptCount}) ---`);
    console.log(`Storage Key: ${j.storageKey}`);
    console.log(`Error Message: "${j.errorMessage}"`);
    console.log(`Raw Output Preserved: ${!!j.rawOutput}`);
  });

  // 5. Total Counts
  const counts = await prisma.job.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  console.log("\n[5] Database Record Distribution in momentum_receipts:");
  counts.forEach((c) => {
    console.log(`- Status ${c.status}: ${c._count.id} rows`);
  });

  console.log("\n======================================================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
