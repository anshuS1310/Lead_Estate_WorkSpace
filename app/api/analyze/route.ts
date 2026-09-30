import { analysisInputSchema, rawAnalysisSchema } from "@/lib/ai-schemas";
import { analysisInstruction } from "@/lib/prompts";
import { buildAnalysis } from "@/lib/score";
import { hasSafeSuggestedReply } from "@/lib/reply-safety";
import { checkRequest, errorResponse, generateJson, readJson } from "@/lib/server-ai";

export const runtime = "nodejs";
export const maxDuration = 35;

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const input = analysisInputSchema.parse(await readJson(request));
    const raw = await generateJson(rawAnalysisSchema, analysisInstruction, { ...input, today: new Date().toISOString().slice(0, 10) }, request.signal, 2500, hasSafeSuggestedReply);
    const analysis = buildAnalysis(raw, input.fields, input.messages);
    return Response.json({ analysis });
  } catch (error) { return errorResponse(error); }
}
