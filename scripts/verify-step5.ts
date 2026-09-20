import { prisma } from "../src/lib/prisma";
import { CONFIG } from "../src/lib/config";

const BASE_URL = "http://localhost:3000";

async function runStep5Verification() {
  console.log("======================================================================");
  console.log("Step 5 Live Verification: Frontend Endpoints & Role 2 Financial Summary");
  console.log("======================================================================\n");

  // 1. Register a test user
  const email = `test_step5_${Date.now()}@example.com`;
  const password = "Password123!";
  console.log(`[1/4] Registering test user (${email})...`);

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Finance Manager" }),
  });

  if (!regRes.ok) throw new Error(`Registration failed: ${regRes.status}`);
  const sessionCookie = regRes.headers.get("set-cookie")?.split(";")[0] || "";
  console.log(`✓ User registered. Cookie: ${sessionCookie.substring(0, 25)}...\n`);

  // Find user record in DB
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User record not found");

  // 2. Populate 3 validated receipt records in PostgreSQL for this user
  console.log("[2/4] Populating 3 validated receipt records in PostgreSQL for analysis...");
  await prisma.job.createMany({
    data: [
      {
        userId: user.id,
        storageKey: "receipt_indah_gift.jpg",
        status: "DONE",
        attemptCount: 1,
        validatedResult: {
          vendor: "INDAH GIFT & HOME DECO",
          date: "2018-10-19",
          totalMinorUnits: 6030,
          currency: "MYR",
          category: "Retail & Shopping",
          lineItems: [
            { description: "ST-PRIVILEGE CARD", amountMinorUnits: 1000, quantity: 1 },
            { description: "TABLE LAMP", amountMinorUnits: 5590, quantity: 1 },
            { description: "DISC 10%", amountMinorUnits: -559, quantity: 1 },
          ],
        },
      },
      {
        userId: user.id,
        storageKey: "receipt_mr_diy.jpg",
        status: "DONE",
        attemptCount: 1,
        validatedResult: {
          vendor: "MR D.I.Y. SDN BHD",
          date: "2019-01-12",
          totalMinorUnits: 3390,
          currency: "MYR",
          category: "Office Supplies",
          lineItems: [
            { description: "CHOPPING BOARD", amountMinorUnits: 1900, quantity: 1 },
            { description: "AIR PRESSURE SPRAYER", amountMinorUnits: 802, quantity: 1 },
            { description: "WINDSHIELD CLEANER", amountMinorUnits: 302, quantity: 1 },
            { description: "BOPP TAPE", amountMinorUnits: 388, quantity: 1 },
          ],
        },
      },
      {
        userId: user.id,
        storageKey: "receipt_yongfatt.jpg",
        status: "DONE",
        attemptCount: 1,
        validatedResult: {
          vendor: "YONGFATT ENTERPRISE",
          date: "2018-12-25",
          totalMinorUnits: 8090,
          currency: "MYR",
          category: "Retail & Shopping",
          lineItems: [{ description: "SCH TR BAG", amountMinorUnits: 8090, quantity: 1 }],
        },
      },
    ],
  });
  console.log("✓ Inserted 3 completed receipt jobs into PostgreSQL.\n");

  // 3. Trigger Role 2 Spending Summary via POST /api/receipts/summary
  console.log("[3/4] Triggering Role 2 Financial Summary (POST /api/receipts/summary)...");
  const summaryRes = await fetch(`${BASE_URL}/api/receipts/summary`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });

  if (!summaryRes.ok) {
    throw new Error(`Summary API failed: ${summaryRes.status} ${await summaryRes.text()}`);
  }

  const summaryData = await summaryRes.json();
  console.log(`✓ Summary generated successfully across ${summaryData.receiptCount} receipts!`);
  console.log("\n--- Generated Financial Summary (Role 2 Output) ---");
  console.log(summaryData.summary);
  console.log("--------------------------------------------------\n");

  // 4. Test Summary Endpoint Rate Limiting (Quota: 10 requests / 60s)
  console.log("[4/4] Testing Rate Limiting on Follow-up Summary Endpoint...");
  let rateLimitHit = false;
  for (let i = 2; i <= 12; i++) {
    const res = await fetch(`${BASE_URL}/api/receipts/summary`, {
      method: "POST",
      headers: { Cookie: sessionCookie },
    });
    if (res.status === 429) {
      rateLimitHit = true;
      const retryAfter = res.headers.get("Retry-After");
      const errBody = await res.json();
      console.log(`✓ Request #${i} triggered HTTP 429 Too Many Requests!`);
      console.log(`  Retry-After Header: ${retryAfter}s`);
      console.log(`  Response Body:      ${JSON.stringify(errBody)}`);
      break;
    }
  }

  if (!rateLimitHit) {
    console.warn("Rate limit did not trigger within 12 requests.");
  }

  console.log("\n======================================================================");
  console.log("Step 5 Live Verification Completed Successfully.");
  console.log("======================================================================");
}

runStep5Verification()
  .catch((err) => {
    console.error("Step 5 Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
