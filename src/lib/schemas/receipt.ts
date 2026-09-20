import { z } from "zod";

/**
 * Zod schema for structured receipt extraction.
 * 
 * Defines the strict schema expected from the extraction tool call.
 * Application code validates model output against this schema before
 * marking the job DONE or persisting the result.
 */
export const ReceiptLineItemSchema = z.object({
  description: z.string().min(1, "Line item description is required"),
  amountMinorUnits: z.number().int("Amount in minor units must be an integer"),
  quantity: z.number().positive("Quantity must be positive").default(1),
});

export const ReceiptExtractionSchema = z.object({
  vendor: z.string().min(1, "Vendor name is required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .describe("Transaction date in YYYY-MM-DD format"),
  totalMinorUnits: z
    .number()
    .int("Total amount in minor units must be an integer")
    .nonnegative("Total amount cannot be negative"),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO code")
    .toUpperCase(),
  lineItems: z.array(ReceiptLineItemSchema).min(1, "At least one line item is required"),
  category: z.enum([
    "Meals & Entertainment",
    "Office Supplies",
    "Travel & Transport",
    "Utilities",
    "Software & Subscriptions",
    "Retail & Shopping",
    "Groceries & Food",
    "Healthcare",
    "Other",
  ]),
});

export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;
export type ReceiptLineItem = z.infer<typeof ReceiptLineItemSchema>;

/**
 * JSON Schema for DeepSeek / OpenAI Tool Calling / Forced Function Use.
 * Matches the structure of ReceiptExtractionSchema.
 */
export const RECEIPT_EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_receipt_data",
    description:
      "Extract structured expense data from a receipt image. Return currency, total amount in minor units (e.g., cents), transaction date, vendor name, category, and itemized line items.",
    parameters: {
      type: "object" as const,
      properties: {
        vendor: {
          type: "string",
          description: "The name of the business or vendor from the receipt.",
        },
        date: {
          type: "string",
          description: "The date of the transaction in YYYY-MM-DD format.",
        },
        totalMinorUnits: {
          type: "integer",
          description:
            "The total amount paid in minor units (e.g., cents/kobo). For $12.50, this is 1250.",
        },
        currency: {
          type: "string",
          description: "3-letter ISO 4217 currency code, e.g. USD, EUR, GBP, NGN.",
        },
        category: {
          type: "string",
          enum: [
            "Meals & Entertainment",
            "Office Supplies",
            "Travel & Transport",
            "Utilities",
            "Software & Subscriptions",
            "Retail & Shopping",
            "Groceries & Food",
            "Healthcare",
            "Other",
          ],
          description: "The spending category best matching the receipt.",
        },
        lineItems: {
          type: "array",
          description: "Itemized list of products or services on the receipt.",
          items: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Description or name of the item purchased.",
              },
              amountMinorUnits: {
                type: "integer",
                description: "The line item price in minor units (e.g. cents).",
              },
              quantity: {
                type: "number",
                description: "Quantity of the item purchased (default 1).",
              },
            },
            required: ["description", "amountMinorUnits"],
          },
        },
      },
      required: ["vendor", "date", "totalMinorUnits", "currency", "lineItems", "category"],
    },
  },
};
