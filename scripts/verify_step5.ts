import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { CONFIG } from "../src/lib/config";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("=== Step 5 Verification ===");
  
  // 1. Fetch completed receipts from database
  const completedJobs = await prisma.job.findMany({
    where: {
      status: "DONE",
      validatedResult: { not: null as any },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      validatedResult: true,
      createdAt: true,
    },
  });

  console.log(`Found ${completedJobs.length} completed receipt records in momentum_receipts.`);

  if (completedJobs.length === 0) {
    console.log("No completed jobs to summarize.");
    return;
  }

  const receiptsData = completedJobs.map((j) => j.validatedResult);

  // 2. Test Role 2 Summary generation with live DeepSeek API
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("Missing DEEPSEEK_API_KEY");
    return;
  }

  const ROLE_2_SUMMARY_SYSTEM_PROMPT = `You are a professional financial spending analyst and accounting advisor (Role 2: Financial Summary).
Your task is to analyze a collection of validated expense receipt records and produce a clear, insightful cross-receipt spending summary.

Guidelines:
1. Provide a concise executive overview of total spending, currency distributions, and top merchants.
2. Group and highlight spending by category with percentage breakdowns.
3. Identify notable trends, highest single expenditures, or potential cost-saving opportunities.
4. Keep tone professional, structured, and easy for finance teams to parse.
5. Do not hallucinate or extrapolate data outside the provided receipt records.`;

  console.log("\nCalling DeepSeek API with Role 2 prompt and parameters:");
  console.log({
    model: CONFIG.MODEL_ID,
    temperature: CONFIG.FOLLOWUP_TEMPERATURE,
    max_tokens: CONFIG.FOLLOWUP_MAX_TOKENS,
    receiptCount: receiptsData.length,
  });

  const client = new OpenAI({
    apiKey: apiKey.trim(),
    baseURL: CONFIG.BASE_URL,
    timeout: CONFIG.REQUEST_TIMEOUT_MS,
  });

  const startTime = Date.now();
  const response = await client.chat.completions.create({
    model: CONFIG.MODEL_ID,
    max_tokens: CONFIG.FOLLOWUP_MAX_TOKENS,
    temperature: CONFIG.FOLLOWUP_TEMPERATURE,
    reasoning_effort: "none",
    messages: [
      {
        role: "system",
        content: ROLE_2_SUMMARY_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Here are the ${receiptsData.length} validated receipt records in JSON format:\n\n${JSON.stringify(
          receiptsData,
          null,
          2
        )}\n\nPlease generate a comprehensive financial summary report covering total spending by currency, category distributions, merchant breakdown, and key observations.`,
      },
    ],
  } as any);
  const elapsedMs = Date.now() - startTime;

  const message = response.choices?.[0]?.message;
  const summaryText = message?.content || (message as any)?.reasoning_content || "No summary text generated.";

  console.log(`\n=== Role 2 Summary Generated (${elapsedMs}ms) ===`);
  console.log(summaryText);
  console.log("\n=== Completion Telemetry ===");
  console.log({
    finish_reason: response.choices?.[0]?.finish_reason,
    usage: response.usage,
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
