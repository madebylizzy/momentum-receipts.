# Momentum Receipts — Project Brief

## 1. Project Overview
Momentum is a platform that helps people achieve personal and professional goals by connecting them with accountability partners.

This assessment is a separate slice from Assessment 1 (Authentication) and Assessment 2 (Subscription), and lives in its own repository. It focuses on a single AI-powered flow: a user uploads a receipt image, a background job processes it through DeepSeek, and a structured expense summary appears.

This assessment does not include the full Momentum application, and it does not include a landing or marketing page.

**Reuse disclosure:** The signed-in user required by this slice is provided by authentication code copied from Assessment 1 (Momentum Authentication) into this repository, following the same pattern as Assessment 2. This is explicit, deliberate reuse, disclosed here and in DOCUMENTATION.md Section 1 — not a shared live application.

## 2. What I Am Building
A signed-in user can:
- Upload one or more receipt images (with size and type restrictions enforced)
- See an honest processing state: pending, processing, done, or failed
- View the extracted, structured expense data once processing completes
- Trigger one follow-up action on the result (e.g. "recategorize," "summarize across receipts," or similar — one clear follow-up, not several)

## 3. User Flow
Signed-in user → Upload receipt(s) → Background job starts → Processing state shown honestly → Result view with structured expense data → One follow-up action available

## 4. Features to Build

### Upload
Accepts one or more receipt image files. Enforces size and file-type restrictions before accepting. Upload triggers a background job — it does not block the HTTP request while the model runs.

### Processing State
Reflects the real state of the job: pending, processing, done, or failed. This state is read from a database job record, not inferred from whether the HTTP request that triggered it is still open.

### Structured Extraction
The receipt image is sent to DeepSeek using forced tool calling (`tool_choice` pointing at a function whose `parameters` schema defines the expected expense shape: vendor, date, total amount in minor units, currency, line items, category). The response is validated against this schema in application code on receipt — the model returning something schema-shaped is not itself treated as proof it's correct.

Two distinct model roles are used, per the assessment's requirement of "two models routed by task, or one model with two distinct system prompts serving two distinct roles": one prompt/role for extracting the raw structured data from the receipt image, and a second, distinct prompt/role for the one follow-up action (e.g. categorizing or summarizing the extracted data). These are not the same prompt reused twice — each has its own system prompt, justified individually.

### Result View
Shows the validated, structured expense data. Also shows the raw model output alongside it, for evidence purposes, distinct from the parsed/validated result.

### Follow-up Action
One user-triggered action on the result (e.g. re-categorize the expense, or generate a short summary across multiple uploaded receipts). Rate limited, same as the upload-triggering endpoint.

## 5. What I Am NOT Building
- A landing page or marketing page
- Account system features beyond what's needed to have a signed-in user (auth is reused from Assessment 1)
- Editing, sharing, or exporting features
- Multiple AI flows — one flow, done properly
- Any UI implying the file itself is stored in the database

## 6. Engineering Requirements (from the assessment)
Every one of these must be present and documented in Section 5 of DOCUMENTATION.md:
- Official SDK only (the `openai` package pointed at DeepSeek's OpenAI-compatible endpoint) — no raw HTTP calls to the API
- API keys (`ANTHROPIC_API_KEY`) written into `.env` by hand, never by the agent, with `.env.example` carrying commented placeholders
- A configuration file holding every changeable value: model identifier, timeout, output token cap, temperature, rate limits, concurrency cap — not hardcoded inline in route handlers
- A written system prompt per role (extraction vs. follow-up), with each parameter justified in one line
- Structured output requested via forced tool use with a defined `input_schema`, validated in application code on receipt, with a defined retry and a defined graceful failure if validation fails
- A job record in the database for each unit of work, holding status, attempt count, and the error message on failure
- A queue or concurrency cap so uploading many files does not fire many simultaneous DeepSeek API calls at once
- Rate limiting on the endpoint that triggers processing and on the follow-up action endpoint
- Files stored in object storage or a documented local development equivalent — only the storage key lives in the database, never the file itself
- A timeout on every model call, with a defined fallback behavior when it's hit

## 7. Success Criteria
- [ ] A user can upload a receipt image and it's accepted or rejected per size/type rules
- [ ] Upload triggers a background job, not a blocking request
- [ ] Processing state (pending/processing/done/failed) is honestly reflected from a real job record
- [ ] Two distinct roles (extraction + follow-up) are served by justified, separate system prompts
- [ ] Structured output is requested via schema (forced tool use) and validated in application code on receipt
- [ ] A validation failure has a defined retry and a defined graceful failure — never a raw error string
- [ ] A job record exists per unit of work with status, attempts, and failure error message
- [ ] A concurrency cap prevents many simultaneous DeepSeek calls from a batch upload
- [ ] Both the upload-triggering endpoint and the follow-up action are rate limited
- [ ] Files live in object storage (or documented local equivalent); only the storage key is in the database
- [ ] Every model call has a timeout with a defined fallback
- [ ] No landing page or out-of-scope screen has been built
