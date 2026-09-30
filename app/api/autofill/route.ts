import { z } from "zod";
import { extractionSchema } from "@/lib/ai-schemas";
import { fieldKeys } from "@/lib/lead-types";
import { hasEvidence } from "@/lib/normalize";
import { verifiedBudgetValue } from "@/lib/money";
import { autofillInstruction } from "@/lib/prompts";
import { checkRequest, errorResponse, generateJson, readJson } from "@/lib/server-ai";

export const runtime = "nodejs";
export const maxDuration = 35;

const inputSchema = z.object({ message: z.string().trim().min(1).max(5000) });

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const input = inputSchema.parse(await readJson(request));
    const result = await generateJson(extractionSchema, autofillInstruction, { message: input.message }, request.signal, 900);
    const fields = Object.fromEntries(fieldKeys.map((key) => {
      const candidate = result.fields[key];
      const valid = candidate.value && candidate.evidence && hasEvidence(input.message, candidate.evidence);
      const value = valid && key === "budget" ? verifiedBudgetValue(candidate.value!, candidate.evidence!) : candidate.value;
      return [key, valid && value ? { value, evidence: candidate.evidence } : { value: null, evidence: null }];
    }));
    return Response.json({ fields });
  } catch (error) { return errorResponse(error); }
}
