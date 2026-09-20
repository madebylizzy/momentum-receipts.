import OpenAI from "openai";
import * as dotenv from "dotenv";
import * as path from "path";
import { CONFIG } from "../src/lib/config";
import { RECEIPT_EXTRACTION_TOOL } from "../src/lib/schemas/receipt";

// Load environment variables from project root .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function runProbe() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  console.log("==================================================");
  console.log("DeepSeek Connection & Parameter Live Probe");
  console.log("==================================================");

  if (!apiKey || apiKey.trim() === "" || apiKey.includes("your-deepseek-api-key")) {
    console.error("ERROR: DEEPSEEK_API_KEY is not set or is still placeholder in .env.");
    console.error("Please ensure .env is saved with DEEPSEEK_API_KEY=sk-...");
    console.log("Detected DEEPSEEK_API_KEY value present:", Boolean(apiKey));
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey: apiKey.trim(),
    baseURL: CONFIG.BASE_URL,
    timeout: CONFIG.REQUEST_TIMEOUT_MS,
  });

  console.log(`[0/3] Checking available models via API (client.models.list())...`);
  try {
    const modelsList = await client.models.list();
    console.log("✓ Models retrieved from API:");
    for (const m of modelsList.data.slice(0, 10)) {
      console.log(`  - ${m.id}`);
    }
  } catch (err: any) {
    console.warn("! models.list() returned error:", err.message);
  }

  console.log(`\n[1/3] Testing reachability of model: '${CONFIG.MODEL_ID}'...`);

  try {
    const basicResponse = await client.chat.completions.create({
      model: CONFIG.MODEL_ID,
      max_tokens: 50,
      messages: [{ role: "user", content: "Ping: Respond with 'PONG' and nothing else." }],
    });

    const reply = basicResponse.choices?.[0]?.message?.content?.trim() || "OK";
    console.log("✓ Model reachability confirmed!");
    console.log(`  Response: ${reply}`);
    console.log(`  Finish reason: ${basicResponse.choices?.[0]?.finish_reason}`);
  } catch (err: any) {
    console.error("✗ Failed to call model with basic request:", err.message);
    if (err.status) console.error(`  HTTP Status: ${err.status}`);
    process.exit(1);
  }

  console.log(`\n[2/3] Testing temperature: ${CONFIG.EXTRACTION_TEMPERATURE} on '${CONFIG.MODEL_ID}'...`);

  try {
    const tempResponse = await client.chat.completions.create({
      model: CONFIG.MODEL_ID,
      max_tokens: 50,
      temperature: CONFIG.EXTRACTION_TEMPERATURE,
      messages: [{ role: "user", content: "Respond with 'TEMP_TEST_OK'." }],
    });

    const tempReply = tempResponse.choices?.[0]?.message?.content?.trim();
    console.log(`✓ Explicit temperature: ${CONFIG.EXTRACTION_TEMPERATURE} accepted without error.`);
    console.log(`  Response: ${tempReply}`);
  } catch (err: any) {
    console.warn("! Temperature test returned an error/rejection:", err.message);
  }

  console.log(`\n[3/3] Testing FORCED tool/function calling on '${CONFIG.MODEL_ID}' (reasoning_effort: 'none', tool_choice: { type: 'function', ... })...`);

  try {
    const toolResponse = await client.chat.completions.create({
      model: CONFIG.MODEL_ID,
      max_tokens: 500,
      temperature: CONFIG.EXTRACTION_TEMPERATURE,
      messages: [
        {
          role: "system",
          content: "You are an expert receipt parser. Extract structured data by calling the extract_receipt_data tool.",
        },
        {
          role: "user",
          content: "Simulated receipt: Total $15.50 at SuperMart on 2026-09-15 for 1 box of pencils ($15.50).",
        },
      ],
      tools: [RECEIPT_EXTRACTION_TOOL],
      tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
      reasoning_effort: "none",
    } as any);

    const toolCall = toolResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.type === "function") {
      console.log(`✓ Forced tool call succeeded! (Finish reason: ${toolResponse.choices?.[0]?.finish_reason})`);
      console.log(`  Function name: ${toolCall.function.name}`);
      console.log(`  Arguments: ${toolCall.function.arguments}`);
    } else {
      console.warn("! Model did not return expected tool call. Raw response:", JSON.stringify(toolResponse.choices?.[0]?.message));
    }
  } catch (err: any) {
    console.warn("! Forced tool call test returned error:", err.message);
  }

  console.log("\n==================================================");
  console.log("Live probe completed.");
  console.log("==================================================");
}

runProbe().catch((err) => {
  console.error("Unexpected probe failure:", err);
  process.exit(1);
});
