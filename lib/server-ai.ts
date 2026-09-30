import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export class ApiFailure extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

const visitors = new Map<string, number[]>();

export function checkRequest(request: Request): void {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiFailure("INVALID_INPUT", 415, "Send JSON data.");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) throw new ApiFailure("INVALID_ORIGIN", 403, "Request origin was rejected.");
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (visitors.get(visitor) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 6) throw new ApiFailure("VISITOR_LIMIT", 429, "You are sending requests quickly. Wait a minute and try again.");
  recent.push(now);
  visitors.set(visitor, recent);
  if (visitors.size > 10000) visitors.clear();
}

export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 100_000) throw new ApiFailure("INVALID_INPUT", 413, "This request is too large.");
  try {
    const raw = await request.text();
    if (raw.length > 100_000) throw new ApiFailure("INVALID_INPUT", 413, "This request is too large.");
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure("INVALID_INPUT", 400, "The request could not be read.");
  }
}

function client(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new ApiFailure("MISSING_KEY", 503, "The AI service is not configured.");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export function classifyError(error: unknown): ApiFailure {
  if (error instanceof ApiFailure) return error;
  if (error instanceof z.ZodError) return new ApiFailure("INVALID_INPUT", 400, "The submitted details are incomplete or too long.");
  const message = error instanceof Error ? error.message : String(error);
  if (/api.key|unauthenticated|permission.denied|leaked|403|401/i.test(message)) return new ApiFailure("AI_ACCESS", 503, "AI access is not available for this project.");
  if (/429|resource.exhausted|quota|rate.limit/i.test(message)) return new ApiFailure("AI_ALLOWANCE", 429, "The AI allowance is temporarily unavailable. Your work is safe.");
  if (/abort|timeout|deadline/i.test(message)) return new ApiFailure("AI_TIMEOUT", 504, "The AI took too long. Please try again.");
  if (/503|500|unavailable|overloaded/i.test(message)) return new ApiFailure("AI_BUSY", 503, "The AI is busy. Please try again shortly.");
  return new ApiFailure("AI_ERROR", 502, "The AI request did not complete. Your work is safe.");
}

export function errorResponse(error: unknown): Response {
  const failure = classifyError(error);
  return Response.json({ code: failure.code, message: failure.message }, { status: failure.status });
}

export async function generateJson<T extends z.ZodTypeAny>(schema: T, system: string, input: unknown, signal: AbortSignal, maxOutputTokens = 2500, accept?: (value: z.infer<T>) => boolean): Promise<z.infer<T>> {
  const responseJsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete responseJsonSchema.$schema;
  const data = JSON.stringify(input).replaceAll("</customer_data>", "[customer tag removed]");
  const ai = client();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `<customer_data>\n${data}\n</customer_data>`,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema,
          temperature: 0.1,
          maxOutputTokens,
          abortSignal: signal,
          httpOptions: { timeout: 25_000 },
        },
      });
      if (!response.text) throw new ApiFailure("BAD_AI_RESPONSE", 502, "The AI returned no usable answer.");
      const parsed = schema.safeParse(JSON.parse(response.text));
      if (parsed.success && (!accept || accept(parsed.data))) return parsed.data;
      console.warn("AI response rejected", parsed.success ? "suggested reply guardrail" : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`).join(", "));
      throw new ApiFailure("BAD_AI_RESPONSE", 502, "The AI returned an incomplete answer.");
    } catch (error) {
      const failure = classifyError(error);
      if (attempt === 0 && failure.code === "BAD_AI_RESPONSE") continue;
      throw failure;
    }
  }
  throw new ApiFailure("BAD_AI_RESPONSE", 502, "The AI returned an incomplete answer.");
}

export async function streamChat(system: string, input: unknown, signal: AbortSignal) {
  const ai = client();
  return ai.models.generateContentStream({
    model,
    contents: `<lead_data>\n${JSON.stringify(input).replaceAll("</lead_data>", "[lead tag removed]")}\n</lead_data>`,
    config: { systemInstruction: system, temperature: 0.35, maxOutputTokens: 700, abortSignal: signal, httpOptions: { timeout: 35_000 } },
  });
}
