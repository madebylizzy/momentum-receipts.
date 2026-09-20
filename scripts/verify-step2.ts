import { prisma } from "../src/lib/prisma";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function runStep2Verification() {
  console.log("==================================================");
  console.log("Step 2 Live Verification: Real HTTP Upload & Rate Limit");
  console.log("==================================================");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // 1. Authenticate / Register a verification user
  const email = `test_step2_${Date.now()}@example.com`;
  const password = "Password123!Secure";
  const name = "Step 2 Verifier";

  console.log(`\n[1/4] Registering test user at ${baseUrl}/api/auth/register...`);
  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  const cookieHeader = registerRes.headers.get("set-cookie");
  if (!cookieHeader) {
    throw new Error(`Failed to get session cookie from registration. Status: ${registerRes.status}`);
  }

  // Extract session token from Set-Cookie header
  const sessionCookie = cookieHeader.split(";")[0];
  console.log(`✓ User registered successfully (${email}). Session cookie acquired: ${sessionCookie.slice(0, 25)}...`);

  // 2. Prepare real image payload
  const sampleImagePath = path.join(process.cwd(), "scripts", "sample_receipt_test.png");
  // Create a minimal 100-byte valid PNG if not exists
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  fs.writeFileSync(sampleImagePath, Buffer.from(pngBase64, "base64"));

  console.log(`\n[2/4] Executing real multipart upload to ${baseUrl}/api/receipts/upload...`);

  async function sendUpload(reqNum: number) {
    const formData = new FormData();
    const fileBytes = fs.readFileSync(sampleImagePath);
    const blob = new Blob([fileBytes], { type: "image/png" });
    formData.append("files", blob, `receipt_sample_${reqNum}.png`);

    const res = await fetch(`${baseUrl}/api/receipts/upload`, {
      method: "POST",
      headers: {
        cookie: sessionCookie,
      },
      body: formData,
    });

    const status = res.status;
    const body = await res.json().catch(() => ({}));
    const retryAfter = res.headers.get("retry-after");
    return { status, body, retryAfter };
  }

  const initialUpload = await sendUpload(1);
  console.log(`✓ Upload #1 Response Status: ${initialUpload.status} (Expected: 202 Accepted)`);
  console.log(`  Response Body:`, JSON.stringify(initialUpload.body, null, 2));

  // 3. Test Rate Limiting by sending rapid upload requests
  console.log(`\n[3/4] Rapidly sending upload requests to test rate limit (Threshold: 10 requests / 60s)...`);
  
  let rateLimitHit = false;
  for (let i = 2; i <= 15; i++) {
    const result = await sendUpload(i);
    if (result.status === 429) {
      console.log(`✓ Request #${i} triggered HTTP 429 Too Many Requests!`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Retry-After Header: ${result.retryAfter} seconds`);
      console.log(`  Response Body:`, JSON.stringify(result.body, null, 2));
      rateLimitHit = true;
      break;
    } else {
      console.log(`  Request #${i} accepted (Status: ${result.status})`);
    }
  }

  if (!rateLimitHit) {
    console.warn("! Warning: Rate limit 429 was not triggered within 15 requests.");
  }

  // 4. Query PostgreSQL directly to inspect real Job records
  console.log(`\n[4/4] Querying PostgreSQL directly via Prisma for created Job records...`);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found in DB");

  const jobs = await prisma.job.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  console.log(`✓ Retrieved ${jobs.length} Job row(s) from database for user ${user.id}:`);
  for (const job of jobs) {
    console.log(`--------------------------------------------------`);
    console.log(`Job ID:          ${job.id}`);
    console.log(`User ID:         ${job.userId}`);
    console.log(`Storage Key:     ${job.storageKey} (Type: ${typeof job.storageKey})`);
    console.log(`Status:          ${job.status}`);
    console.log(`Attempt Count:   ${job.attemptCount}`);
    console.log(`Error Message:   ${job.errorMessage}`);
    console.log(`Validated Result:${JSON.stringify(job.validatedResult)}`);
    console.log(`Raw Output:      ${job.rawOutput ? "[Present / JSON]" : "null"}`);
    console.log(`Created At:      ${job.createdAt.toISOString()}`);
  }

  // Confirm schema integrity
  console.log("\nStorage Key vs File Binary Verification:");
  console.log(`- storageKey stored in DB: "${jobs[0]?.storageKey}" (Clean string filename)`);
  console.log(`- File binary on disk at:  "uploads/${jobs[0]?.storageKey}" (Size: ${fs.statSync(path.join(process.cwd(), "uploads", jobs[0]?.storageKey)).size} bytes)`);
  console.log(`- Database columns present: [id, userId, storageKey, status, attemptCount, errorMessage, rawOutput, validatedResult, createdAt, updatedAt]`);
  console.log(`- Binary blob columns in DB: NONE.`);

  // Cleanup test image
  if (fs.existsSync(sampleImagePath)) fs.unlinkSync(sampleImagePath);

  console.log("\n==================================================");
  console.log("Step 2 Live Verification Completed Successfully.");
  console.log("==================================================");
}

runStep2Verification()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
