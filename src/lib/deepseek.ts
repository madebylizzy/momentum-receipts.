import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { CONFIG } from "./config";
import {
  RECEIPT_EXTRACTION_TOOL,
  ReceiptExtractionSchema,
  type ReceiptExtraction,
} from "./schemas/receipt";

// Initialize DeepSeek client using official OpenAI SDK with custom baseURL and timeout
function getDeepSeekClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("DEEPSEEK_API_KEY is not configured in .env");
  }
  return new OpenAI({
    apiKey: apiKey.trim(),
    baseURL: CONFIG.BASE_URL,
    timeout: CONFIG.REQUEST_TIMEOUT_MS,
  });
}

/**
 * Maps file extension to supported image MIME type.
 */
function getMediaType(storageKey: string): string {
  const ext = path.extname(storageKey).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

export interface ExtractionResult {
  validatedResult: ReceiptExtraction;
  rawOutput: any;
  attemptCount: number;
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert financial receipt parser and data extraction assistant (Role 1: Extraction).
Your sole purpose is to accurately inspect receipt and invoice images and extract structured expense records.

Strict Rules:
1. Vendor: Identify the clear merchant or business name at the top of the receipt.
2. Date: Extract the transaction date in strict YYYY-MM-DD format. If only partial date is available, use reasonable inference or ISO format.
3. Total Amount: Calculate or extract the final total amount in minor units (e.g. cents/kobo/pence). For $45.20 USD, totalMinorUnits is 4520. Must be an integer >= 0.
4. Currency: 3-letter ISO 4217 code (e.g., USD, EUR, GBP, NGN, CAD).
5. Category: Select exactly one matching category from:
   - Meals & Entertainment
   - Office Supplies
   - Travel & Transport
   - Utilities
   - Software & Subscriptions
   - Retail & Shopping
   - Groceries & Food
   - Healthcare
   - Other
6. Line Items: List each purchased item with description, amount in minor units, and quantity.
7. You MUST call the 'extract_receipt_data' tool with your extracted parameters. Do not respond with plain conversational text.`;

/**
 * Extracts structured receipt data from an uploaded image using forced tool calling and Zod validation,
 * with retry-once-then-fail-gracefully logic.
 */
export async function extractReceiptData(storageKey: string): Promise<ExtractionResult> {
  const client = getDeepSeekClient();
  const filePath = path.join(process.cwd(), "uploads", storageKey);

  // Read image file from disk (storage key only)
  const imageBuffer = await fs.readFile(filePath);
  const base64Data = imageBuffer.toString("base64");
  const mediaType = getMediaType(storageKey);
  const dataUrl = `data:${mediaType};base64,${base64Data}`;

  const initialUserMessage: OpenAI.Chat.ChatCompletionMessageParam = {
    role: "user",
    content: [
      {
        type: "text",
        text: "Please extract the structured expense details from this receipt image using the extract_receipt_data tool.",
      },
      {
        type: "image_url",
        image_url: {
          url: dataUrl,
        },
      },
    ],
  };

  const initialMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: EXTRACTION_SYSTEM_PROMPT,
    },
    initialUserMessage,
  ];

  let attemptCount = 1;

  // Attempt 1: Initial extraction with forced tool calling (reasoning_effort: "none" disables thinking mode)
  const response = await client.chat.completions.create({
    model: CONFIG.MODEL_ID,
    max_tokens: CONFIG.EXTRACTION_MAX_TOKENS,
    temperature: CONFIG.EXTRACTION_TEMPERATURE,
    messages: initialMessages,
    tools: [RECEIPT_EXTRACTION_TOOL],
    tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
    reasoning_effort: "none",
  } as any);

  const choice = response.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.find(
    (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall =>
      tc.type === "function" && "function" in tc && tc.function?.name === "extract_receipt_data"
  );

  if (!toolCall || !toolCall.function?.arguments) {
    throw new Error(
      `Model did not return the expected tool call. Finish reason: ${choice?.finish_reason}. Raw message: ${JSON.stringify(
        choice?.message
      )}`
    );
  }

  let rawInput: any;
  try {
    rawInput = JSON.parse(toolCall.function.arguments);
  } catch (err: any) {
    rawInput = {};
  }

  const validation = ReceiptExtractionSchema.safeParse(rawInput);

  if (validation.success) {
    return {
      validatedResult: validation.data,
      rawOutput: response,
      attemptCount: 1,
    };
  }

  // Attempt 2: Retry once with clarifying feedback
  attemptCount = 2;
  const errorDetails = validation.error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  const retryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...initialMessages,
    choice.message,
    {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        status: "error",
        message: `Your tool call failed application schema validation with the following errors:\n${errorDetails}\n\nPlease correct these issues and call 'extract_receipt_data' again with valid data.`,
      }),
    },
  ];

  const retryResponse = await client.chat.completions.create({
    model: CONFIG.MODEL_ID,
    max_tokens: CONFIG.EXTRACTION_MAX_TOKENS,
    temperature: CONFIG.EXTRACTION_TEMPERATURE,
    messages: retryMessages,
    tools: [RECEIPT_EXTRACTION_TOOL],
    tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
    reasoning_effort: "none",
  } as any);

  const retryChoice = retryResponse.choices?.[0];
  const retryToolCall = retryChoice?.message?.tool_calls?.find(
    (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall =>
      tc.type === "function" && "function" in tc && tc.function?.name === "extract_receipt_data"
  );

  if (!retryToolCall || !retryToolCall.function?.arguments) {
    throw new Error(
      `Retry attempt failed: Model did not return tool call. Finish reason: ${retryChoice?.finish_reason}. Raw message: ${JSON.stringify(
        retryChoice?.message
      )}`
    );
  }

  let retryRawInput: any;
  try {
    retryRawInput = JSON.parse(retryToolCall.function.arguments);
  } catch (err: any) {
    retryRawInput = {};
  }

  const retryValidation = ReceiptExtractionSchema.safeParse(retryRawInput);

  if (retryValidation.success) {
    return {
      validatedResult: retryValidation.data,
      rawOutput: retryResponse,
      attemptCount: 2,
    };
  }

  // Graceful failure: throw detailed validation error
  const finalErrors = retryValidation.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");

  const validationError = new Error(`Schema validation failed after retry: ${finalErrors}`);
  (validationError as any).rawOutput = retryResponse;
  (validationError as any).attemptCount = 2;
  throw validationError;
}
