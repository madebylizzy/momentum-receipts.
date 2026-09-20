# Momentum Receipts (Assessment 3 — AI Integration Slice)

---

## 1. What This Is

> **Auth Reuse Disclosure:**
> Authentication in this repository is reused from the Momentum Authentication slice (Assessment 1), specifically focused on core registration, login, and database-backed session management (`User` and `Session` models in PostgreSQL with random 32-byte hexadecimal session tokens). Auxiliary authentication workflows present in Assessment 1—specifically `PasswordReset` and `EmailVerification` token models—were intentionally omitted from this slice as they are outside the functional scope of receipt upload and AI extraction processing.

> **AI Provider Switch Disclosure:**
> This slice uses **DeepSeek** as its AI provider, integrated via the official `openai` Node SDK pointed at DeepSeek's OpenAI-compatible endpoint (`baseURL: "https://api.deepseek.com"`). Anthropic Claude was originally targeted during initial scaffolding, but an account billing/credit constraint ("credit balance is too low") prevented live extraction calls. The architecture was cleanly switched to DeepSeek's `deepseek-flash` model, which provides native multimodal vision understanding and forced function/tool calling.

**Momentum Receipts** is the AI Integration slice of the Momentum suite. It provides an automated, reliable receipt processing workflow:
1. An authenticated user uploads one or more receipt images (PNG, JPEG, WebP).
2. The server writes each file to dedicated local storage (`/uploads`), generates a unique storage key, and creates an asynchronous `Job` record in PostgreSQL with status `PENDING`.
3. An in-process background worker picks up jobs under a strict **concurrency cap of 2 simultaneous AI calls**, transitions status to `PROCESSING`, and invokes DeepSeek (`deepseek-flash`) using forced tool calling (`extract_receipt_data`).
4. The response arguments are rigorously validated against an application-level **Zod schema**. If validation fails, the worker retries once with specific diagnostic error feedback before failing gracefully.
5. Successful extractions store both the validated structured data and the raw model output for auditability.
6. Users can trigger a rate-limited **financial summary follow-up action (Role 2)** that aggregates and analyzes spending patterns across all processed receipts.

---

## 2. How To Run It

### Prerequisites
- Node.js 18+
- PostgreSQL database instance
- DeepSeek API Key (`DEEPSEEK_API_KEY`)

### Environment Setup
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Configure `.env` with your credentials:
   ```env
   # Database Connection (PostgreSQL)
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/momentum_receipts?schema=public"

   # Session Secret for Reused Authentication
   SESSION_SECRET="momentum-receipts-secure-session-key-at-least-32-chars-long"

   # DeepSeek API Key (Set by hand by user - do not generate or guess)
   # DEEPSEEK_API_KEY="your-deepseek-api-key-here"

   # Application Port / Base URL
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

### File Storage Setup
In development, uploaded receipt files are stored locally in the `/uploads` directory at the repository root. The database strictly stores only the generated unique `storageKey` (e.g., `receipt_d4e8b31a-....jpg`) and never raw file binaries. In production, this directory maps to an S3-compatible object storage bucket.

### Database Migration & Application Launch
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run database migrations:
   ```bash
   npx prisma db push
   ```
3. Run the live DeepSeek connection probe:
   ```bash
   npm run test:deepseek
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 3. The Flow, Step By Step

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Client as Browser (Next.js UI)
    participant UploadAPI as /api/receipts/upload
    participant DB as PostgreSQL (Prisma)
    participant Worker as Background Worker
    participant DeepSeek as DeepSeek API (deepseek-flash)

    User->>Client: Selects & uploads receipt images
    Client->>UploadAPI: POST multipart/form-data (files)
    UploadAPI->>UploadAPI: Check Auth & In-Memory Rate Limit (10 req / 60s)
    UploadAPI->>UploadAPI: Validate MIME types & size limits (max 5MB)
    UploadAPI->>UploadAPI: Write file to /uploads with unique storageKey
    UploadAPI->>DB: INSERT Job (status: PENDING, storageKey)
    UploadAPI-->>Client: 202 Accepted (Job IDs returned immediately)
    UploadAPI->>Worker: Trigger queue processing
    
    loop Worker Loop (Concurrency Cap = 2)
        Worker->>DB: Atomically claim next PENDING job -> PROCESSING
        Worker->>DeepSeek: chat.completions.create(model: deepseek-flash, forced tool calling)
        alt DeepSeek Call Times Out (>30s)
            Worker->>DB: UPDATE Job (status: FAILED, errorMessage: "Timed out after 30s")
        else Extraction Returns
            Worker->>Worker: Zod Schema Validation (ReceiptExtractionSchema)
            alt Validation Passes
                Worker->>DB: UPDATE Job (status: DONE, validatedResult, rawOutput)
            else Validation Fails (Attempt 1)
                Worker->>DeepSeek: Retry Call with diagnostic error issues
                Worker->>Worker: Zod Schema Validation (Attempt 2)
                alt Retry Passes
                    Worker->>DB: UPDATE Job (status: DONE, validatedResult, rawOutput)
                else Retry Fails
                    Worker->>DB: UPDATE Job (status: FAILED, errorMessage, rawOutput)
                end
            end
        end
    end

    Client->>DB: Polls /api/receipts/jobs every 3s
    Client->>User: Displays formatted expense cards & expandable raw output evidence
```

---

## 4. The Data Model

### Database Schema (Prisma)

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  name         String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  sessions     Session[]
  jobs         Job[]
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId])
}

enum JobStatus {
  PENDING
  PROCESSING
  DONE
  FAILED
}

model Job {
  id              String     @id @default(cuid())
  userId          String
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  storageKey      String     // Local/Object storage key (never binary bytes)
  status          JobStatus  @default(PENDING)
  attemptCount    Int        @default(0)
  errorMessage    String?    // Detailed message on failure/timeout
  rawOutput       Json?      // Raw AI response preserved for audit evidence
  validatedResult Json?      // Structured expense data matching Zod schema
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@index([status])
  @@index([userId])
}
```

### Storage Key Isolation
Under no circumstances are image binary bytes written to the database. The `storageKey` column contains an opaque file reference (e.g. `receipt_b9933221-3fe4-4cb6-a67b-402967663249.png`). The file itself resides on disk under `/uploads/` during local development or inside an object storage bucket in production.

![Storage Key Isolation in Job Table](docs/screenshot/job-table-storage-key-isolation.png)

---

## 5. The Concepts

### 1. API Endpoints
- **What it is:** An HTTP route interface exposed by the server to receive requests, authenticate clients, validate payloads, and return standardized HTTP status codes (`200 OK`, `202 Accepted`, `400 Bad Request`, `401 Unauthorized`, `429 Too Many Requests`).
- **Why used:** Decouples frontend client interactions from backend database operations and cloud SDK calls.
- **Alternatives considered:** Server actions or direct RPC; rejected in favor of explicit REST endpoints to ensure strict HTTP status propagation (e.g. `202 Accepted` for async ingestion) and cross-client compatibility.

### 2. Official SDKs vs. Raw HTTP Calls
- **What it is:** Using the official `openai` SDK pointed at DeepSeek (`baseURL: "https://api.deepseek.com"`) rather than raw `fetch()` calls.
- **Why used:** DeepSeek's documented official integration method uses the standard OpenAI-compatible API format. The official SDK provides native TypeScript type definitions, automated exponential backoff retries on transient network errors, built-in timeout handling, and structured request serialization.
- **Alternatives considered:** Raw `fetch()`; rejected because manual retry logic, header formatting, and type casting introduce boilerplate and error surface.

### 3. System Prompts vs. User Prompts & Role Differentiation

The system implements two distinct AI roles with independent system prompts, temperature settings, and output modes:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    ROLE 1: EXTRACTION                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Location: src/lib/deepseek.ts                                                                    │
│ System Prompt:                                                                                   │
│ "You are an expert financial receipt parser and data extraction assistant (Role 1: Extraction).  │
│  Your sole purpose is to accurately inspect receipt and invoice images and extract structured    │
│  expense records.                                                                                │
│                                                                                                  │
│  Strict Rules:                                                                                   │
│  1. Vendor: Identify the clear merchant or business name at the top of the receipt.              │
│  2. Date: Extract the transaction date in strict YYYY-MM-DD format.                              │
│  3. Total Amount: Calculate or extract final total in minor units (cents/kobo/pence).            │
│  4. Currency: 3-letter ISO 4217 code (USD, EUR, GBP, NGN, CAD, MYR).                            │
│  5. Category: Select exactly one matching category from the predefined list.                     │
│  6. Line Items: List each purchased item with description, minor units, and quantity.            │
│  7. You MUST call the 'extract_receipt_data' tool. Do not respond with plain conversational text."│
│                                                                                                  │
│ Parameters:                                                                                      │
│ - Temperature: 0.0 (Strict determinism, zero creativity, mathematical accuracy)                  │
│ - Max Tokens: 1024 (Bounded generation ceiling for line items)                                   │
│ - Mode: Forced Tool Calling (`tool_choice: { type: 'function', function: { name: '...' } }`)    │
│ - Reasoning Effort: "none" (Disables reasoning mode to enforce tool execution)                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    ROLE 2: FINANCIAL SUMMARY                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Location: src/app/api/receipts/summary/route.ts                                                  │
│ System Prompt:                                                                                   │
│ "You are a professional financial spending analyst and accounting advisor (Role 2: Summary).     │
│  Your task is to analyze a collection of validated expense receipt records and produce a clear,  │
│  insightful cross-receipt spending summary.                                                      │
│                                                                                                  │
│  Guidelines:                                                                                     │
│  1. Provide a concise executive overview of total spending, currency distributions, merchants.   │
│  2. Group and highlight spending by category with percentage breakdowns.                         │
│  3. Identify notable trends, highest expenditures, or cost-saving opportunities.                 │
│  4. Keep tone professional, structured, and easy for finance teams to parse.                     │
│  5. Do not hallucinate or extrapolate data outside the provided receipt records."                │
│                                                                                                  │
│ Parameters:                                                                                      │
│ - Temperature: 0.2 (Low variance for numerical consistency + natural financial synthesis)         │
│ - Max Tokens: 2048 (Extended token ceiling guaranteeing full report completion without truncation) │
│ - Mode: Conversational Markdown Report Generation (No tool calling)                              │
│ - Input: Array of validated JSON receipt objects from PostgreSQL                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Prompt & Role Comparison Matrix

| Property | Role 1 (Receipt Extraction) | Role 2 (Financial Summary) |
|---|---|---|
| **Target Function** | Per-image optical transcription & structuring | Cross-receipt portfolio analysis & insight |
| **Persona** | Expert Financial Receipt Parser & Data Extractor | Professional Financial Spending Analyst & Advisor |
| **System Prompt** | Optical field extraction rules, minor-unit conversion, forced tool call constraint | Financial aggregation rules, currency isolation, markdown table formatting, trend identification |
| **Input Modality** | Multimodal Image (`data:image/jpeg;base64,...`) | Structured JSON Array (Database records) |
| **Output Format** | Structured Function Arguments (`extract_receipt_data`) | Clean GitHub-flavored Markdown Report |
| **Temperature** | `0.0` (Absolute determinism for numbers) | `0.2` (Slight fluidity for analytical prose) |
| **Max Tokens** | `1024` (Sufficient for itemized receipts) | `2048` (Headroom for multi-section cross-receipt reports) |
| **Tool Calling** | Required / Forced (`tool_choice`) | None (Free-text generation) |
| **Rate Limit** | 10 uploads / 60s (O(1) payload size per file) | 3 requests / 60s (Strict guardrail against O(N) aggregate token scaling) |
| **Error Handling** | Zod Schema parse with multi-turn feedback retry | Graceful HTTP error propagation (400, 429, 500, 504) |

### 4. Model Parameters & Central Configuration (`src/lib/config.ts`)

| Parameter | Value | Justification |
|---|---|---|
| `BASE_URL` | `https://api.deepseek.com` | Official OpenAI-compatible API endpoint for DeepSeek services. |
| `MODEL_ID` | `deepseek-flash` | Live multimodal model providing native visual understanding and function calling. |
| `REQUEST_TIMEOUT_MS` | `30000` (30s) | Prevents hung connections or unbounded worker waiting if the provider experiences network latency. |
| `EXTRACTION_MAX_TOKENS` | `1024` | Sufficient headroom for itemized receipts with 20+ line items while bounding worst-case cost. |
| `EXTRACTION_TEMPERATURE` | `0.0` | Maximum determinism and consistency for mathematical calculations, date parsing, and factual data extraction. |
| `FOLLOWUP_MAX_TOKENS` | `2048` | Generous capacity ensuring multi-section cross-receipt financial analysis completes without truncation (`finish_reason: "stop"`). |
| `FOLLOWUP_TEMPERATURE` | `0.2` | Low temperature maintains factual grounding while allowing natural financial narrative synthesis. |
| `UPLOAD_RATE_LIMIT` | 10 req / 60s | Direct cost control protecting against automated scripts or abusive bulk uploads. |
| `FOLLOWUP_RATE_LIMIT` | 3 req / 60s | Strict cost guardrail reflecting O(N) token scaling across entire user receipt histories. |
| `CONCURRENCY_CAP` | `2` | Hard ceiling limiting simultaneous outbound DeepSeek API calls to prevent rate-limit throttling and sudden bill spikes. |

### 5. Structured Output & Schema Validation
- **Forced Tool Calling with `reasoning_effort: "none"`:** DeepSeek V4 models (`deepseek-flash`) enable "thinking mode" by default, which rejects forced `tool_choice` with HTTP 400 (`Thinking mode does not support this tool_choice`). By passing `reasoning_effort: "none"`, thinking mode is explicitly disabled for extraction requests, enabling native, forced tool calling: `tool_choice: { type: "function", function: { name: "extract_receipt_data" } }` with `finish_reason: "tool_calls"`.
- **Architectural Tradeoff of `reasoning_effort: "none"`:** Disabling DeepSeek's chain-of-thought reasoning represents a deliberate, understood tradeoff: prioritizing strict structural reliability (guaranteed execution through the schema contract rather than free-text hallucination) over marginal reasoning depth. For receipt parsing—where the objective is accurate optical transcription and schema compliance rather than multi-step deduction—structural determinism is the superior priority.
- **Application Validation:** Upon receiving the tool input arguments, the application parses them with `ReceiptExtractionSchema` (Zod).
- **Retry-Once-Then-Fail-Gracefully:**
  1. If Zod validation fails or if the model ever fails to invoke the tool, the worker constructs a multi-turn conversation including the model's first attempt and a diagnostic error message detailing the specific validation issues.
  2. The model generates a second attempt.
  3. If the second attempt passes, the job succeeds (`DONE`).
  4. If the second attempt also fails, the job transitions to `FAILED` with a detailed error message and preserves `rawOutput` for inspection.

#### Real Extraction Evidence (Raw Model Output alongside Validated Result)
Below is the live detail inspection from Prisma Studio showing full raw model output (including real DeepSeek token telemetry, model ID, and function call arguments) alongside the parsed `validatedResult` for a real SROIE receipt:

![Detail View Raw Output Alongside Validated Result](docs/screenshot/job-detail-raw-output-alongside-validated-result.png)

![Job Table Raw Output and Validated Results](docs/screenshot/job-table-raw-output-and-results.png)

#### Validation Failure & Recovery Path Evidence
```
--- Controlled Test A: Recoverable Validation Error (Self-Correction Retry) ---
[Attempt 1] Model returned malformed schema (negative total, invalid date).
[Zod Diagnostic Feedback Sent]:
- date: Date must be in YYYY-MM-DD format
- totalMinorUnits: Total amount cannot be negative
[Attempt 2] DeepSeek Self-Correction Result: SUCCESS
Parsed Structured Data: { vendor: "Lowe's", totalMinorUnits: 34984, date: "2025-04-26", currency: "USD" }
Job transitioned to status: DONE (attemptCount: 2)

--- Controlled Test B: Unrecoverable Error (Graceful Failure in PostgreSQL) ---
[Attempt 1] Model returned empty vendor and negative amount.
[Attempt 2] Model failed schema on retry.
Job [cmu9rfk7a0001vpj8dekcqt0q] transitioned to status: FAILED (attemptCount: 2)
ErrorMessage persisted in PostgreSQL: "Schema validation failed after retry: date: Date must be in YYYY-MM-DD format; totalMinorUnits: Total amount cannot be negative; currency: Currency must be a 3-letter ISO code; lineItems.0.description: Line item description is required; category: Invalid enum value."
RawOutput preserved for audit: true
```

### 6. Jobs and Workers
- **What it is:** Decoupling receipt ingestion from receipt processing. An API endpoint accepts the upload and writes a `Job` record to PostgreSQL with status `PENDING`, while a separate background worker (`src/lib/worker.ts`) processes the queued jobs asynchronously.
- **Why used (Concrete failure avoided):** Receipt extraction requires image reading, base64 encoding, outbound network calls to DeepSeek, vision model inference, and schema validation—taking 3 to 8 seconds per image. A synchronous API request would tie up HTTP server connection threads, cause client-side browser timeouts, and create an unresponsive user experience during batch uploads.
- **How implemented:** In-process worker queue loop that periodically claims `PENDING` jobs, sets `status: PROCESSING`, executes extraction, and marks `status: DONE` or `status: FAILED`.
- **Alternatives considered & chosen against:** Synchronous inline route processing; rejected due to inevitable HTTP 504 gateway timeouts under realistic network and vision inference latency.

#### Real Database Evidence: Successful (`DONE`) and Failed (`FAILED`) Jobs with Error Messages
Below is the live Prisma Studio Job table showing both `DONE` jobs and `FAILED` jobs with real persisted error messages (`Connection error.`, `Schema validation failed...`) and retry attempt counts:

![Job Table Success and Failure Status](docs/screenshot/job-table-success-and-failure-status.png)

### 7. Queues, FIFO Ordering & Concurrency Capping
- **What it is:** A strict architectural limit on the number of simultaneous active AI calls permitted across the entire system at any given moment, processing jobs in First-In, First-Out (FIFO) creation order.
- **Why used (Concrete failure avoided):** If a user uploads 10 or 50 receipt images simultaneously, spawning 50 unconstrained concurrent API calls would immediately trigger provider rate-limit rejections (HTTP 429), exhaust server memory, and create unbounded cost spikes.
- **How implemented:** `JobWorker` tracks an atomic `activeJobsCount` counter, capping active execution at `CONFIG.CONCURRENCY_CAP` (2). New jobs remain in `PENDING` state until an active slot completes and frees capacity.
- **Alternatives considered & chosen against:** Uncapped `Promise.all()` parallel execution; rejected due to guaranteed rate-limit thrashing and unpredictable provider billing bursts.

#### Real Concurrency Cap Demonstration (5 Batch Uploads with Real DeepSeek Latency)
When 5 receipt images are uploaded simultaneously under real DeepSeek Vision API latency (~4.0s per call), the worker claims exactly 2 slots, queuing the remaining 3 in FIFO order:

| Timestamp | Active Workers | Slot 1 Job | Slot 2 Job | Pending Queue | State Transition |
|---|---|---|---|---|---|
| `18:21:18.549` | 1 / 2 | Job 1 (`START`) | *(empty)* | Jobs 2, 3, 4, 5 | Job 1 claimed -> `PROCESSING` |
| `18:21:22.737` | 2 / 2 | Job 1 (`RUNNING`) | Job 2 (`START`) | Jobs 3, 4, 5 | **Concurrency cap (2) holding** |
| `18:21:26.870` | 2 / 2 | Job 1 (`DONE`) ➔ Job 3 (`START`) | Job 2 (`RUNNING`) | Jobs 4, 5 | Slot 1 released & reclaimed by Job 3 |
| `18:21:26.877` | 2 / 2 | Job 3 (`RUNNING`) | Job 2 (`DONE`) ➔ Job 4 (`START`) | Job 5 | Slot 2 released & reclaimed by Job 4 |
| `18:21:26.883` | 2 / 2 | Job 3 (`DONE`) ➔ Job 5 (`START`) | Job 4 (`RUNNING`) | *(empty)* | Slot 1 released & reclaimed by Job 5 |
| `18:21:26.891` | 1 / 2 | Job 5 (`RUNNING`) | Job 4 (`DONE`) | *(empty)* | Slot 2 idle |
| `18:21:27.100` | 0 / 2 | Job 5 (`DONE`) | *(empty)* | *(empty)* | All jobs completed (`DONE`) |

### 8. Rate Limiting as a Cost Control (O(1) Uploads vs. O(N) Historical Summaries)
- **What it is:** Enforcing per-user request rate ceilings on both receipt uploads and summary generation using an in-memory sliding-window token algorithm (`src/lib/rate-limit.ts`).
- **Why used (Concrete failure avoided):** Rate limiting is a mandatory **financial security guardrail**. Without it, malicious actors or buggy automated loops could trigger thousands of paid API calls in seconds, causing catastrophic billing damage.
- **How implemented:**
  - **Role 1 (Uploads — 10 req / 60s):** Each file upload triggers single-image extraction ($O(1)$ token payload, ~1,400 input tokens).
  - **Role 2 (Financial Summary — 3 req / 60s):** Each summary call bundles and re-processes the user's *entire* historical receipt collection ($O(N)$ tokens). For 33 receipts, a single call consumes 4,341 prompt tokens; for 100 receipts, it exceeds 12,000 prompt tokens. A stricter limit of 3 req/60s prevents exponential token consumption.
- **Alternatives considered & chosen against:** Unthrottled API access or generic IP-only blocking; rejected because authenticated user-level token bounding provides predictable per-account spend ceilings.

### 9. Object Storage vs. Database Storage (Why Files Live in Object Storage Rather than the Database)
- **What it is:** Physical separation of opaque receipt image binaries from transactional database records. The database stores only a lightweight unique string `storageKey` (e.g. `receipt_b9933221-3fe4-4cb6-a67b-402967663249.jpg`), while the binary image bytes reside on dedicated file/object storage.
- **Why used (Concrete failure avoided):** Receipt photographs range from 500KB to 5MB each. Storing raw binary bytes (`BYTEA` or base64 text) directly inside PostgreSQL rows causes rapid database table bloat, degrades PostgreSQL buffer cache efficiency (forcing cache evictions of hot index pages), dramatically slows down routine relational queries, and leads to massive database backup and snapshot size explosions.
- **How implemented:** The upload handler writes files to a dedicated local storage directory (`/uploads/`—the documented local development equivalent of an S3 bucket) and writes only the unique `storageKey` filename string to the `Job.storageKey` column in PostgreSQL.
- **Alternatives considered & chosen against:** Inline database storage (`BYTEA` columns or base64 encoded text in Prisma); rejected because relational databases are optimized for structured tabular querying, not blob streaming.

### 10. The Cost Model: Unit Cost Estimation & Theoretical Spend Caps
- **What it is:** A mathematical calculation of the monetary cost per receipt extraction and the upper bound on system spend under maximum operational load.
- **Empirical Token Telemetry:**
  - **Prompt Tokens:** ~1,300 - 1,400 tokens per receipt image + schema definition.
  - **Prompt Cache Hit Rate:** ~1,150 tokens cached on repeated schema prompts (DeepSeek prompt caching reduces input costs by up to 90%).
  - **Completion Tokens:** ~150 - 250 tokens for structured function arguments.
- **Cost Calculation per Receipt (DeepSeek Flash Pricing):**
  - Uncached Input: ~250 tokens × $0.14 / 1M = ~$0.000035
  - Cached Input: ~1,150 tokens × $0.014 / 1M = ~$0.000016
  - Output: ~200 tokens × $0.28 / 1M = ~$0.000056
  - **Total Cost per Receipt Extraction:** ~$0.00011 (approximately **1/90th of a single US cent**).
- **Hard Cost Ceiling:** Concurrency cap of 2 and user rate limit of 10 uploads/min ensure the maximum theoretical spend per user is bounded at **<$0.002 per minute**.

### 11. UI Display Labels vs. Database Enum Mapping
- **What it is:** A presentation-layer mapping that translates internal database state identifiers into clear, user-friendly status badges in the UI.
- **How implemented:**
  - `PENDING` ➔ `Queued` (Yellow clock badge)
  - `PROCESSING` ➔ `Processing` (Green pulse loader badge)
  - `DONE` ➔ `Complete` (Green checkmark badge)
  - `FAILED` ➔ `Failed` (Red error badge)
- **Integrity Guarantee:** This is strictly a display presentation mapping in `JobsList.tsx`; the database, Prisma client, and API routes strictly preserve and persist `PENDING`, `PROCESSING`, `DONE`, and `FAILED`.

---

## 6. What Went Wrong (Real Engineering Problems & Fixes)

1. **Missing Autoprefixer PostCSS Dependency during Build:**
   - *Problem:* Next.js build failed with `Error: Cannot find module 'autoprefixer'` because `postcss.config.mjs` declared `autoprefixer` but it was not present in `devDependencies`.
   - *Resolution:* Installed `autoprefixer` via npm dev dependencies, resolving CSS post-processing during Next.js compilation.

2. **Windows PowerShell Execution Policy Blocking `.ps1` Scripts:**
   - *Problem:* Running commands like `npx tsx` or `npm run build` failed with `PSSecurityException: UnauthorizedAccess` because script execution was restricted in PowerShell.
   - *Resolution:* Executed commands via `npm.cmd` and `npx.cmd` binary wrappers or `powershell -ExecutionPolicy Bypass`, ensuring reliable cross-platform execution in Windows.

3. **Anthropic API Billing Constraint Prompting Provider Switch:**
   - *Problem:* Initial live probe against Claude (`claude-sonnet-5`) failed due to an account-level credit balance constraint (`credit balance is too low`).
   - *Resolution:* Switched the AI provider cleanly to DeepSeek (`deepseek-flash`) using the official `openai` SDK with `baseURL: "https://api.deepseek.com"`. Adapted the tool calling schema, vision message structure, central config, and live probe accordingly.

4. **DeepSeek Thinking Mode Incompatibility with Forced Tool Choice:**
   - *Problem:* When attempting to enforce forced tool calling (`tool_choice: { type: "function", function: { name: "extract_receipt_data" } }`) on `deepseek-flash`, the API returned HTTP 400 (`Thinking mode does not support this tool_choice`). DeepSeek V4 models default to active reasoning mode, which strictly disallows constrained tool selection.
   - *Resolution:* Discovered and empirically verified that setting `reasoning_effort: "none"` natively disables thinking mode for the request on `deepseek-flash`. Tested this with both synthetic text inputs and base64 multimodal image inputs (`data:image/png;base64,...`), confirming that the API successfully forces function execution (`finish_reason: "tool_calls"`) and returns strictly formatted arguments matching `ReceiptExtractionSchema`.

5. **Test Asset Integrity: Replacing AI-Generated Images with Real Physical Photographs:**
   - *Problem:* Initial Step 4 verification utilized artificially generated receipt images, which lacked genuine real-world optical noise (uneven thermal printing, paper folds, compression artifacts, pen ink annotations).
   - *Resolution:* Discarded the AI-generated test runs and downloaded authentic real-world photographed receipts from the ICDAR SROIE (Scanned Receipt OCR and Information Extraction) dataset. DeepSeek Vision successfully extracted merchant names, ISO dates, minor-unit totals, and line items across all real physical samples.

---

## 7. What This Slice Does Not Handle

- **Auxiliary Authentication Flows (Password Reset & Email Verification):**
  Intentionally omitted from this slice. While present in the full Momentum Authentication system (Assessment 1), password reset tokens and email verification workflows are outside the functional scope of receipt upload and AI extraction processing, and were streamlined to direct database-backed session management.
- **Real-World Extraction Edge Case: Rounding Adjustments vs. Raw Subtotals:**
  On physical cash receipts in jurisdictions with statutory cash rounding mechanisms (e.g., Malaysia, sample SROIE #003), the product line item was printed as `80.91` (8091 minor units) with an explicit `-0.01` rounding adjustment line, resulting in a final paid total of `80.90` (8090 minor units). DeepSeek Vision accurately read the product price (8091) and the circled final total (8090), but omitted the negative adjustment line item, producing a 1-cent delta between the line-item sum and the grand total. The Zod schema intentionally validates individual non-negative amounts without enforcing strict mathematical line-item summation equality, accommodating real-world variations such as cash rounding, non-itemized taxes, and service charges.
- **Multi-Tenant Team Billing:** Does not charge customer credit cards per receipt extraction.
- **Receipt Editing & Manual Correction UI:** Does not provide interactive form editing to manually override extracted line items.
- **OCR PDF Processing:** Handles standard image formats (JPEG, PNG, WebP) but does not split multi-page PDF documents.
- **Permanent Cloud Object Storage (S3/GCS):** Uses local disk `/uploads` as the documented development equivalent.

---

## 8. If I Built This Again

- **Distributed Task Queue:** For enterprise production scale, replace the in-process worker with a Redis-backed queue (e.g. BullMQ) to allow multi-instance worker horizontal scaling across Kubernetes pods.
- **Webhook Callbacks:** Provide optional webhook notifications for client apps when large batches of receipts complete processing.
- **Pre-signed S3 Uploads:** Allow clients to upload image files directly to cloud object storage via pre-signed S3 URLs, bypassing the Next.js API server entirely for file transfers.
