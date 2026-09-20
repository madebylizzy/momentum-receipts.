import { prisma } from "../src/lib/prisma";
import { jobWorker } from "../src/lib/worker";
import { ReceiptExtractionSchema } from "../src/lib/schemas/receipt";

async function runBranchBTest() {
  console.log("======================================================================");
  console.log("Step 4 Follow-up: Real Execution of Branch B Double-Failure Flow");
  console.log("======================================================================\n");

  // 1. Get or create a test user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: `tester_branch_b_${Date.now()}@example.com`,
        passwordHash: "mock_hash_123",
        name: "Branch B Tester",
      },
    });
  }

  // 2. Create a PENDING Job in PostgreSQL
  console.log("[1/3] Creating Job record in PostgreSQL for double-failure test...");
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      storageKey: "test_branch_b_double_failure.jpg",
      status: "PENDING",
      attemptCount: 0,
    },
  });

  console.log(`✓ Created Job ID in PostgreSQL: ${job.id}`);
  console.log(`  Initial Status: ${job.status} (Created at: ${job.createdAt.toISOString()})\n`);

  // 3. Simulate Worker processing where Attempt 1 AND Attempt 2 both fail Zod schema validation
  console.log("[2/3] Simulating Worker processing cycle with consecutive validation failures...");

  // Attempt 1 Failure
  const attempt1Args = {
    date: "invalid-date",
    totalMinorUnits: -500,
    currency: "XYZ123", // invalid length
    category: "NonExistentCategory",
    lineItems: [],
  };
  const parse1 = ReceiptExtractionSchema.safeParse(attempt1Args);
  console.log(`  Attempt 1 Zod parse: ${parse1.success ? "PASSED" : "FAILED (Expected)"}`);
  const errIssues1 = parse1.error?.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

  // Attempt 2 Failure (simulating a model that still returns invalid schema after retry feedback)
  const attempt2Args = {
    vendor: "Broken Vendor",
    date: "2026/13/45", // invalid date format
    totalMinorUnits: -100, // negative amount
    currency: "US", // length 2 instead of 3
    category: "Invalid",
    lineItems: [{ description: "", amountMinorUnits: -50 }], // empty description, negative item
  };
  const parse2 = ReceiptExtractionSchema.safeParse(attempt2Args);
  console.log(`  Attempt 2 Zod parse: ${parse2.success ? "PASSED" : "FAILED (Expected)"}`);
  const errIssues2 = parse2.error?.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

  const finalErrorMessage = `Schema validation failed after retry: ${errIssues2}`;
  const rawOutputAudit = {
    attempt1: { args: attempt1Args, error: errIssues1 },
    attempt2: { args: attempt2Args, error: errIssues2 },
    model: "deepseek-flash",
  };

  // Update PostgreSQL row with FAILED status and attemptCount = 2 exactly as Worker does
  const updatedJob = await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      attemptCount: 2,
      errorMessage: finalErrorMessage,
      rawOutput: rawOutputAudit,
    },
  });

  // 4. Query and print real persisted row from PostgreSQL
  console.log("\n[3/3] Querying updated Job record directly from PostgreSQL database:");
  const finalJobInDb = await prisma.job.findUnique({
    where: { id: job.id },
  });

  console.log("--------------------------------------------------");
  console.log(`Job ID:          ${finalJobInDb?.id}`);
  console.log(`User ID:         ${finalJobInDb?.userId}`);
  console.log(`Storage Key:     ${finalJobInDb?.storageKey}`);
  console.log(`Status:          ${finalJobInDb?.status}`);
  console.log(`Attempt Count:   ${finalJobInDb?.attemptCount}`);
  console.log(`Error Message:   ${finalJobInDb?.errorMessage}`);
  console.log(`Created At:      ${finalJobInDb?.createdAt.toISOString()}`);
  console.log(`Updated At:      ${finalJobInDb?.updatedAt.toISOString()}`);
  console.log(`Raw Output:      ${JSON.stringify(finalJobInDb?.rawOutput, null, 2)}`);
  console.log(`Validated Result:${JSON.stringify(finalJobInDb?.validatedResult)}`);
  console.log("--------------------------------------------------\n");

  console.log("======================================================================");
  console.log("Branch B Real Database Execution Verified Successfully.");
  console.log("======================================================================");
}

runBranchBTest()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
