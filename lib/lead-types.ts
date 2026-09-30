import { z } from "zod";

export const fieldKeys = ["name", "location", "requirement", "budget", "timeline"] as const;
export type FieldKey = (typeof fieldKeys)[number];

export const fieldSchema = z.object({
  value: z.string().max(300),
  source: z.enum(["empty", "ai", "human"]),
  evidence: z.string().max(500).nullable(),
});
export type LeadField = z.infer<typeof fieldSchema>;

export const fieldsSchema = z.object({
  name: fieldSchema,
  location: fieldSchema,
  requirement: fieldSchema,
  budget: fieldSchema,
  timeline: fieldSchema,
});
export type LeadFields = z.infer<typeof fieldsSchema>;

export const messageSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(5000),
  createdAt: z.string().datetime(),
  included: z.boolean(),
});
export type LeadMessage = z.infer<typeof messageSchema>;

export const factorSchema = z.object({
  points: z.number().int().min(0).max(35),
  maximum: z.number().int().min(1).max(35),
  reason: z.string().max(300),
  evidence: z.string().max(500).nullable(),
});

export const analysisSchema = z.object({
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
  factors: z.object({
    timeline: factorSchema,
    budget: factorSchema,
    requirements: factorSchema,
    buyingSignals: factorSchema,
  }),
  score: z.number().int().min(0).max(100),
  rubricVersion: z.literal(1),
  analyzedAt: z.string().datetime(),
});
export type LeadAnalysis = z.infer<typeof analysisSchema>;

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(6000),
  createdAt: z.string().datetime(),
  stopped: z.boolean().optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const leadSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  fields: fieldsSchema,
  messages: z.array(messageSchema).min(1).max(100),
  pendingUpdate: z.string().max(5000).nullable(),
  analysis: analysisSchema,
  analyzedSnapshot: z.string().max(30000),
  conversation: z.array(chatMessageSchema).max(100),
});
export type Lead = z.infer<typeof leadSchema>;

export const draftSchema = z.object({
  leadId: z.string().nullable(),
  message: z.string().max(5000),
  fields: fieldsSchema,
});
export type LeadDraft = z.infer<typeof draftSchema>;

export const workspaceSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0),
  leads: z.array(z.unknown()),
  activeId: z.string().nullable(),
  sort: z.enum(["priority", "newest"]),
  filter: z.enum(["all", "hot", "warm", "cold"]),
});

export function emptyFields(): LeadFields {
  const blank = (): LeadField => ({ value: "", source: "empty", evidence: null });
  return { name: blank(), location: blank(), requirement: blank(), budget: blank(), timeline: blank() };
}

export function emptyDraft(leadId: string | null = null, fields: LeadFields = emptyFields()): LeadDraft {
  return { leadId, message: "", fields: structuredClone(fields) };
}

export function analysisSnapshot(messages: LeadMessage[], fields: LeadFields): string {
  return JSON.stringify({
    rubricVersion: 1,
    messages: messages.filter((message) => message.included).map(({ id, text, createdAt }) => ({ id, text, createdAt })),
    fields: Object.fromEntries(fieldKeys.map((key) => [key, fields[key].value.trim()])),
  });
}

export function priorityTag(score: number): "hot" | "warm" | "cold" {
  return score >= 70 ? "hot" : score >= 30 ? "warm" : "cold";
}
