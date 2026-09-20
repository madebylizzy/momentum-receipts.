import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth/get-user";
import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";

const ROLE_2_SUMMARY_SYSTEM_PROMPT = `You are a professional financial spending analyst and accounting advisor (Role 2: Financial Summary).
Your task is to analyze a collection of validated expense receipt records and produce a clear, insightful cross-receipt spending summary.

Guidelines:
1. Provide a concise executive overview of total spending, currency distributions, and top merchants.
2. Group and highlight spending by category with percentage breakdowns.
3. Identify notable trends, highest single expenditures, or potential cost-saving opportunities.
4. Keep tone professional, structured, and easy for finance teams to parse.
5. Do not hallucinate or extrapolate data outside the provided receipt records.`;

export async function POST(request: Request) {
  // 1. Authenticate user
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit (Cost control for follow-up API calls)
  const rateLimitResult = checkRateLimit(
    "summary",
    user.id,
    CONFIG.FOLLOWUP_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Please wait before generating another summary.",
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

  // 3. Fetch all completed jobs for this user
  const completedJobs = await prisma.job.findMany({
    where: {
      userId: user.id,
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

  if (completedJobs.length === 0) {
    return NextResponse.json(
      {
        error: "No completed receipts found to summarize. Please upload and process receipts first.",
      },
      { status: 400 }
    );
  }

  // 4. Prepare data payload for DeepSeek
  const receiptsData = completedJobs.map((job) => job.validatedResult);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return NextResponse.json(
      { error: "AI service is not configured (missing DEEPSEEK_API_KEY)." },
      { status: 500 }
    );
  }

  const client = new OpenAI({
    apiKey: apiKey.trim(),
    baseURL: CONFIG.BASE_URL,
    timeout: CONFIG.REQUEST_TIMEOUT_MS,
  });

  try {
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

    const message = response.choices?.[0]?.message;
    const summaryText = message?.content || (message as any)?.reasoning_content || "No summary text generated.";

    return NextResponse.json({
      receiptCount: completedJobs.length,
      summary: summaryText,
      rawOutput: response,
    });
  } catch (err: any) {
    console.error("[Summary API Error]:", err.message);
    const isTimeout = err.name === "AbortError" || err.message?.includes("timeout");
    return NextResponse.json(
      {
        error: isTimeout
          ? "Request to AI provider timed out after 30 seconds."
          : `Failed to generate summary: ${err.message}`,
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
