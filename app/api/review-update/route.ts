import { z } from "zod";
import { extractionSchema, rawAnalysisSchema, updateInputSchema } from "@/lib/ai-schemas";
import { fieldKeys, type LeadFields, type LeadMessage } from "@/lib/lead-types";
import { hasEvidence } from "@/lib/normalize";
import { verifiedBudgetValue } from "@/lib/money";
import { updateInstruction } from "@/lib/prompts";
import { buildAnalysis } from "@/lib/score";
import { hasSafeSuggestedReply } from "@/lib/reply-safety";
import { checkRequest, errorResponse, generateJson, readJson } from "@/lib/server-ai";

export const runtime = "nodejs";
export const maxDuration = 35;

const updateResultSchema = z.object({ proposals: extractionSchema.shape.fields, analysis: rawAnalysisSchema });

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const input = updateInputSchema.parse(await readJson(request));
    const pending: LeadMessage = { id: crypto.randomUUID(), text: input.pendingMessage, createdAt: new Date().toISOString(), included: true };
    const raw = await generateJson(updateResultSchema, updateInstruction, { ...input, pendingMessageId: pending.id, today: new Date().toISOString().slice(0, 10) }, request.signal, 4500, (value) => hasSafeSuggestedReply(value.analysis));
    const effectiveFields: LeadFields = structuredClone(input.fields);
    const proposals = Object.fromEntries(fieldKeys.map((key) => {
      const candidate = raw.proposals[key];
      const valid = candidate.value && candidate.evidence && hasEvidence(input.pendingMessage, candidate.evidence);
      const value = valid && key === "budget" ? verifiedBudgetValue(candidate.value!, candidate.evidence!) : candidate.value;
      if (valid && value) effectiveFields[key] = { value, source: "ai", evidence: candidate.evidence! };
      return [key, valid && value ? { value, evidence: candidate.evidence } : { value: null, evidence: null }];
    }));
    const messages = [...input.messages, pending];
    const analysis = buildAnalysis(raw.analysis, effectiveFields, messages);
    const existingAnalysis = buildAnalysis(raw.analysis, input.fields, messages);
    return Response.json({ proposals, analysis, existingAnalysis, pending });
  } catch (error) { return errorResponse(error); }
}
