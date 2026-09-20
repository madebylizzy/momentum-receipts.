/**
 * Momentum Receipts - Central Configuration
 * 
 * AGENTS.md §3 & §5: All AI and operational parameters are defined in this single file.
 * Each parameter includes a one-line justification carried into DOCUMENTATION.md Section 5.
 */

export const CONFIG = {
  // Provider Base URL: Official DeepSeek OpenAI-compatible endpoint.
  BASE_URL: "https://api.deepseek.com",

  // Model Identifier: Verified live multimodal model offering native visual understanding and function calling.
  MODEL_ID: "deepseek-flash",

  // Request Timeout (ms): Upper time limit on DeepSeek API calls to prevent hanging background workers if provider stalls.
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds

  // Extraction Role (Role 1) Token Cap: Sufficient token budget to capture all line items and metadata without unbounded generation.
  EXTRACTION_MAX_TOKENS: 1024,

  // Extraction Role (Role 1) Temperature: Zero temperature enforces strict factual extraction and determinism for receipt figures.
  EXTRACTION_TEMPERATURE: 0.0,

  // Follow-up Summary Role (Role 2) Token Cap: Generous capacity ensuring multi-section cross-receipt financial analysis completes without truncation.
  FOLLOWUP_MAX_TOKENS: 2048,

  // Follow-up Summary Role (Role 2) Temperature: Low temperature ensures numerical consistency across summaries while enabling natural phrasing.
  FOLLOWUP_TEMPERATURE: 0.2,

  // Upload Rate Limit: Cost control against paid API calls while allowing standard user batch uploads.
  UPLOAD_RATE_LIMIT: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 60 seconds (10 requests per minute)
  },

  // Follow-up Action Rate Limit: Stricter cost guardrail (3 req/min) reflecting O(N) token scaling across entire user receipt histories.
  FOLLOWUP_RATE_LIMIT: {
    maxRequests: 3,
    windowMs: 60 * 1000, // 60 seconds (3 requests per minute)
  },

  // Concurrency Cap: System-wide cap on simultaneous DeepSeek API calls to prevent cost spikes and provider rate-limit saturation.
  CONCURRENCY_CAP: 2,

  // File Upload Restrictions
  STORAGE: {
    uploadDir: "uploads",
    maxFileSizeBytes: 5 * 1024 * 1024, // 5MB per file
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
} as const;

export type AppConfig = typeof CONFIG;
