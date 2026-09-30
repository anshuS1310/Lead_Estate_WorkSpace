import { chatInputSchema } from "@/lib/ai-schemas";
import { chatInstruction } from "@/lib/prompts";
import { hasSafeReplyText } from "@/lib/reply-safety";
import { checkRequest, errorResponse, readJson, streamChat } from "@/lib/server-ai";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const input = chatInputSchema.parse(await readJson(request));
    const savedReply = input.lead.analysis.suggestedReply;
    const context = {
      lead: {
        ...input.lead,
        messages: input.lead.messages.filter((message) => message.included),
        analysis: { ...input.lead.analysis, suggestedReply: hasSafeReplyText(savedReply) ? savedReply : null },
      },
      history: input.history.filter((item) => item.role === "user" || hasSafeReplyText(item.text)),
      question: input.question,
      replyStatus: hasSafeReplyText(savedReply) ? null : "The saved suggested reply made an unsupported property or appointment claim. Draft a fresh reply from customer facts only.",
      pendingStatus: input.lead.pendingUpdate ? "New customer text, not yet analyzed; score is unchanged." : null,
    };
    const response = await streamChat(chatInstruction, context, request.signal);
    const iterator = response[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done || !first.value.text) throw new Error("The AI returned no text.");
    const encoder = new TextEncoder();
    const send = (type: string, data: string) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let pending = "";
        const emitCompletedSentences = (text: string) => {
          pending += text;
          let boundary = pending.search(/[.!?।\n]/);
          while (boundary >= 0) {
            const sentence = pending.slice(0, boundary + 1);
            if (!hasSafeReplyText(sentence)) throw new Error("unsupported claim");
            controller.enqueue(send("text", sentence));
            pending = pending.slice(boundary + 1);
            boundary = pending.search(/[.!?।\n]/);
          }
        };
        try {
          emitCompletedSentences(first.value.text ?? "");
          while (true) {
            const item = await iterator.next();
            if (item.done) break;
            if (item.value.text) emitCompletedSentences(item.value.text);
          }
          if (pending) {
            if (!hasSafeReplyText(pending)) throw new Error("unsupported claim");
            controller.enqueue(send("text", pending));
          }
          controller.enqueue(send("done", ""));
        } catch {
          controller.enqueue(send("error", "The answer could not be safely completed. Please retry."));
        } finally { controller.close(); }
      },
      cancel() { void iterator.return?.(undefined); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
