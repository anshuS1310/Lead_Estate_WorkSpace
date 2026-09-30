import { z } from "zod";
import { fieldKeys } from "./lead-types";

const extractedFieldSchema = z.object({
  value: z.string().max(300).nullable(),
  evidence: z.string().max(500).nullable(),
});

export const extractionSchema = z.object({
  fields: z.object(Object.fromEntries(fieldKeys.map((key) => [key, extractedFieldSchema])) as Record<(typeof fieldKeys)[number], typeof extractedFieldSchema>),
});
export type Extraction = z.infer<typeof extractionSchema>;

const sourceSchema = z.object({
  type: z.enum(["message", "field", "none"]),
  text: z.string().max(500),
  messageId: z.string().max(100).nullable(),
});

export const rawAnalysisSchema = z.object({
  summary: z.string().min(1).max(600),
  intent: z.object({
    category: z.enum(["ready", "comparing", "researching", "browsing"]),
    reason: z.string().max(250),
  }),
  requirements: z.array(z.string().max(180)).max(8),
  concerns: z.array(z.string().max(180)).max(8),
  nextAction: z.object({ action: z.string().min(1).max(350), timing: z.string().max(100) }),
  suggestedReply: z.string().min(1).max(1200),
  gaps: z.array(z.string().max(180)).max(8),
  conflicts: z.array(z.string().max(250)).max(5),
  timelineSource: sourceSchema,
  timelineMonths: z.number().min(0).max(120).nullable(),
  budgetSource: sourceSchema,
  requirementDetails: z.array(z.object({
    category: z.enum(["location", "propertyType", "sizeOrRooms", "amenity"]),
    source: sourceSchema,
  })).max(8),
  buyingSignal: z.object({
    level: z.enum(["none", "options", "engaged", "action"]),
    source: sourceSchema,
    reason: z.string().max(250),
  }),
});
export type RawAnalysis = z.infer<typeof rawAnalysisSchema>;

export const fieldInputSchema = z.object({ value: z.string().max(300), source: z.enum(["empty", "ai", "human"]), evidence: z.string().max(500).nullable() });
export const fieldsInputSchema = z.object({
  name: fieldInputSchema,
  location: fieldInputSchema,
  requirement: fieldInputSchema,
  budget: fieldInputSchema,
  timeline: fieldInputSchema,
});

export const messageInputSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(5000),
  createdAt: z.string().datetime(),
  included: z.boolean(),
});

export const analysisInputSchema = z.object({
  fields: fieldsInputSchema,
  messages: z.array(messageInputSchema).min(1).max(100),
}).refine((data) => data.messages.some((message) => message.included), "At least one message must be included")
  .refine((data) => data.messages.filter((message) => message.included).reduce((sum, message) => sum + message.text.length, 0) <= 20000, "Included messages are too long");

export const updateInputSchema = analysisInputSchema.safeExtend({ pendingMessage: z.string().min(1).max(5000) });

export const chatInputSchema = z.object({
  lead: z.object({
    id: z.string().min(1),
    fields: fieldsInputSchema,
    messages: z.array(messageInputSchema).min(1).max(100),
    pendingUpdate: z.string().max(5000).nullable(),
    analysis: z.object({
      summary: z.string().max(600),
      intent: z.object({ category: z.string(), reason: z.string() }),
      requirements: z.array(z.string()).max(8),
      concerns: z.array(z.string()).max(8),
      nextAction: z.object({ action: z.string(), timing: z.string() }),
      suggestedReply: z.string().max(1200),
      gaps: z.array(z.string()).max(8),
      score: z.number(),
    }),
  }),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) })).max(12),
  question: z.string().trim().min(1).max(1000),
});
