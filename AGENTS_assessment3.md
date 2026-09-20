# AGENTS.md

## Project Name
Momentum Receipts (Assessment 3 — AI Integration Slice)

## 1. Project Context
This is a separate repository from Momentum Authentication (Assessment 1) and Momentum Subscription (Assessment 2). It is one slice of a larger four-assessment bootcamp project. This repository focuses only on a single AI-powered flow: receipt upload → background job → Claude extraction → structured result → one follow-up action.

## 1a. Tech Stack
- **Framework:** Next.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **AI provider:** DeepSeek, via the official `openai` Node SDK pointed at DeepSeek's OpenAI-compatible endpoint (`baseURL: "https://api.deepseek.com"`) — this is DeepSeek's documented official integration method, not a workaround. No raw HTTP calls to the API.
- **Model:** verify the current model ID against DeepSeek's live API docs at build time — do not assume from any prior document, including this one
- **File storage:** Object storage in production; a documented local-disk equivalent for development, with only the storage key ever written to the database

Do not introduce a different framework, database, ORM, or AI provider without explicit confirmation.

**Provider decision (final, confirmed — supersedes any earlier note in this document or its history):** This project uses DeepSeek. It was switched from Anthropic Claude due to a real billing/credit constraint on the Anthropic account. This history (Claude attempted first, blocked by billing, switched to DeepSeek) is legitimate, disclosed material — state it plainly in DOCUMENTATION.md Section 1 and/or Section 6 ("What Went Wrong"), not hidden.

## 1b. Reused Authentication
Authentication code is copied from the Momentum Authentication repository (Assessment 1) into this repository, following the same disclosed-reuse pattern as Assessment 2. Do not modify the copied auth code's core behavior without explicit instruction. Document this reuse plainly in DOCUMENTATION.md Section 1.

## 1c. Structured Output Method (DeepSeek-specific — OpenAI-compatible tool calling)
DeepSeek's API uses the standard OpenAI-style function/tool calling shape: define a `tools` array with a function whose `parameters` (JSON Schema) match the desired output, and set `tool_choice: { type: "function", function: { name: "extract_receipt_data" } }` to force the model to call that specific function rather than responding in free text. 

**Thinking Mode Note:** DeepSeek V4 models (`deepseek-flash`) enable "thinking mode" by default, which rejects forced `tool_choice` with HTTP 400 (`Thinking mode does not support this tool_choice`). To enforce forced tool choice without error, pass `reasoning_effort: "none"` on extraction requests to disable thinking mode, allowing `tool_choice: { type: "function", function: { name: "extract_receipt_data" } }` to succeed reliably.

This does **not** remove the requirement to validate on receipt. Forced tool calling makes malformed output less likely, not impossible. Application code must independently validate the tool-call arguments against the real schema (e.g. a Zod schema) before treating it as trustworthy data, and implement graceful failure if the model ever fails to invoke the tool.

Images are sent as part of the message content array, following DeepSeek's documented vision input format (base64 data URL via `image_url: { url: "data:image/...;base64,..." }`).

## 2. Your Role
Same as Assessments 1 and 2: follow requirements carefully, build only what's in scope, ask before making unstated product decisions, work in small reviewable steps.


## 3. Scope

### Upload & Job Creation
- Accept one or more receipt image files (e.g. jpg, png). Enforce a size limit and file-type allowlist before accepting.
- Each accepted file creates a `Job` record in the database with `status: PENDING` and immediately returns to the client — the HTTP request does not block while Claude processes the image.
- The actual file is written to object storage (or the documented local dev equivalent — see §6); only the storage key is written to the `Job` record.

### Background Processing
- A worker (in-process queue, or a simple polling mechanism — pick the simplest approach that satisfies the concurrency cap requirement, and justify the choice) picks up `PENDING` jobs, sets `status: PROCESSING`, calls Claude, and on completion sets `status: DONE` with the validated result, or `status: FAILED` with the error message.
- A concurrency cap limits how many jobs are processed simultaneously, regardless of how many were uploaded at once. State the cap and where it's enforced.

### Extraction (Role 1)
- System prompt dedicated to extracting structured expense data from a receipt image: vendor, date, total amount (minor units), currency, line items, category.
- Requested via forced tool use with an `input_schema` matching this shape.
- Validated against the real schema (e.g. Zod) in application code on receipt. If validation fails: retry once with a clarifying instruction to the model, then fail gracefully (job marked `FAILED` with a clear error, not a crash) if the retry also fails.

### Follow-up Action (Role 2)
- A distinct system prompt for the one follow-up action defined in BRIEF.md §4 (e.g. re-categorization or cross-receipt summary). This is not the extraction prompt reused — it is a separate role with its own justified parameters.
- Rate limited, same as the upload-triggering endpoint.

### Configuration
- A single configuration file (not scattered inline values) holds: model identifier, request timeout, output token cap, temperature (justified per role), rate limit thresholds, and the concurrency cap.
- Every parameter set gets a one-line justification, to be carried into DOCUMENTATION.md Section 5.

## 4. Out of Scope
Do NOT build:
- A landing page or marketing page
- Multiple AI flows — one flow only
- Editing, sharing, or exporting features on the result
- Any account system beyond the reused auth
- Storing the uploaded file itself in the database — only the storage key

## 5. API Keys and Secrets
- `DEEPSEEK_API_KEY` is set by hand in `.env` by the user, never generated or guessed by the agent. Provide a commented placeholder in `.env.example`.
- The key must never be exposed in frontend code, client bundles, or logs.

## 6. File Storage
- Production pattern: object storage (e.g. S3-compatible). Development equivalent: local disk under a dedicated directory, documented clearly in DOCUMENTATION.md Section 2, with the same "only the key in the database" rule enforced identically in both environments.
- Confirm this choice and the local dev equivalent explicitly before building — this is a real architectural decision, not a default to assume silently.

## 7. Rate Limiting & Concurrency
- Rate limit the upload-triggering endpoint and the follow-up action endpoint. State the thresholds and justify them (this is a cost control against a paid API, not just an abuse control — say so explicitly in documentation).
- The concurrency cap is a distinct mechanism from rate limiting: rate limiting controls how often a user can *trigger* work; the concurrency cap controls how many Claude calls run *simultaneously* across all jobs, regardless of who triggered them. Do not conflate the two or implement only one.

## 8. Timeouts & Fallbacks
- Every call to Claude has a defined timeout. State the value and justify it.
- Define what happens when a call times out: the job is marked `FAILED` with a clear, honest message — never left in `PROCESSING` indefinitely, and never silently retried without limit.

## 9. Database Requirements
At minimum, support:
- **Job**: id, user reference, storage key (not the file), status (PENDING/PROCESSING/DONE/FAILED), attempt count, error message (nullable), raw model output (for evidence — distinct from the validated result), validated result (structured, matching the schema), created/updated timestamps

Do not add unrelated Momentum models.

## 10. Decision Log (mandatory, every checkpoint)
Same rule as Assessments 1 and 2: anything built beyond what's explicitly asked for gets named, with reasoning, in the same message it's built — including in the "Beyond the brief" section of every checkpoint report, even when empty.

## 11. Known Traps (from the assessment — check against these explicitly)
- Letting an agent write API keys itself
- Hardcoding the model name and token limit directly in a route handler instead of the config file
- Parsing free-text model output with string operations instead of requesting structured output via forced tool use
- Testing only with clean, well-formed inputs — never an empty file, a corrupted file, or one at the exact size limit
- Storing the uploaded file in the database instead of just its storage key
- Treating a 200 HTTP response as proof the work succeeded, when the real work happens in the background job and the job's own status is where success or failure actually lives

## 12. Defence Questions (prepare to answer these exactly as asked)
- Justify your temperature setting and your output token cap.
- Show me what a user sees when the provider times out.
- Your model returns something that fails validation. Trace what happens next, line by line.
- I upload fifty files and press the button. What exactly happens, and what stops it costing you fifty simultaneous calls?

## 13. Documentation
Final deliverable: `DOCUMENTATION.md` at the repository root, same 8-section structure as Assessments 1 and 2:
1. What This Is (include the auth-reuse disclosure)
2. How To Run It (include DeepSeek API key setup, the provider-switch history, and the local file-storage dev equivalent)
3. The Flow, Step By Step
4. The Data Model
5. The Concepts — required: what an API endpoint is; SDKs vs. raw HTTP and why official SDKs; system prompts vs. user prompts; model parameters (the ones set and why); structured output and schema validation, including what happens when validation fails; jobs and workers; queues/FIFO and why concurrency is capped; rate limiting as a cost control; why files live in object storage rather than the database; the cost model — what one run costs approximately, and what caps the total. Each with all four questions answered, including what was chosen against and why.
6. What Went Wrong (minimum three real problems)
7. What This Slice Does Not Handle
8. If I Built This Again

Required evidence: a screenshot of the jobs table showing a successful run and a failed run, with the error message visible on the failure; the raw model output for one request alongside the validated, parsed result; evidence of what happens when validation fails, produced by deliberately breaking the schema or the response; the concurrency cap holding, demonstrated by uploading enough files at once and showing the provider request pattern; a screenshot showing the database holds only a storage key, not the file.
