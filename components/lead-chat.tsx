"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Clipboard, MessageCircle, Send, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage, Lead } from "@/lib/lead-types";

const suggestions = [
  "What should I emphasize on the call?",
  "How should I handle their main concern?",
  "Shorten the suggested reply for WhatsApp.",
  "Translate the suggested reply to Hindi.",
];

export function LeadChat({ lead, busy, onBusy, onSave, onClear }: {
  lead: Lead;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onSave: (leadId: string, messages: ChatMessage[]) => void;
  onClear: (leadId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<{ question: string; answer: string } | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const currentLeadRef = useRef(lead.id);

  useEffect(() => { if (nearBottom) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [lead.conversation.length, streaming, nearBottom]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function send(text = input) {
    const question = text.trim();
    if (!question || question.length > 1000 || busy) return;
    const leadId = lead.id;
    const controller = new AbortController();
    abortRef.current = controller;
    stoppedRef.current = false;
    setInput("");
    setStreaming({ question, answer: "" });
    onBusy(true);
    let full = "";
    let complete = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          lead: { id: lead.id, fields: lead.fields, messages: lead.messages, pendingUpdate: lead.pendingUpdate, analysis: lead.analysis },
          history: lead.conversation.slice(-12).map(({ role, text }) => ({ role, text })), question,
        }),
      });
      if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.message || "Chat is unavailable right now."); }
      if (!response.body) throw new Error("The answer did not start.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const event = part.match(/^event: (.+)$/m)?.[1];
          const dataLine = part.match(/^data: (.+)$/m)?.[1];
          if (!event || !dataLine) continue;
          const data = JSON.parse(dataLine) as string;
          if (event === "text") { full += data; setStreaming({ question, answer: full }); }
          if (event === "done") complete = true;
          if (event === "error") throw new Error(data || "Answer was interrupted.");
        }
        if (done) break;
      }
      if (!complete) throw new Error("Answer was interrupted.");
    } catch (error) {
      if (!stoppedRef.current) {
        toast.error(error instanceof Error ? error.message : "Chat failed. Your question was kept.");
        if (!full) setInput(question);
      }
    } finally {
      if (currentLeadRef.current === leadId && (complete || (stoppedRef.current && full))) {
        const time = new Date().toISOString();
        onSave(leadId, [
          { id: crypto.randomUUID(), role: "user", text: question, createdAt: time },
          { id: crypto.randomUUID(), role: "assistant", text: full, createdAt: time, stopped: stoppedRef.current },
        ]);
      } else if (full && !complete && !stoppedRef.current) toast.error("The partial answer was not saved. Retry your question.");
      setStreaming(null);
      abortRef.current = null;
      onBusy(false);
    }
  }

  function stop() { stoppedRef.current = true; abortRef.current?.abort(); }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); }
    catch { toast.error("Copy was blocked. Select the answer and copy manually."); }
  }

  return <section className="flex h-full min-h-0 flex-col bg-[#fffaf6]" aria-label="Lead assistant">
    <div className="border-b border-[#eadcd5] bg-[#fffefd] px-5 py-6"><div className="flex items-center justify-between"><div><p className="lead-kicker">Lead companion</p><h2 className="mt-2 flex items-center gap-2 text-xl font-extrabold tracking-[-0.04em] text-[#282626]"><MessageCircle className="size-5 text-[#d94e53]" />Conversation</h2></div>{lead.conversation.length > 0 && <Button variant="ghost" size="icon" aria-label="Clear conversation" title="Clear conversation" disabled={busy} onClick={() => onClear(lead.id)}><Trash2 className="size-4" /></Button>}</div><p className="mt-3 text-xs leading-relaxed text-[#746c68]">Ask about this customer. Nothing is sent or changed automatically.</p></div>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6" onScroll={(event) => { const element = event.currentTarget; setNearBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80); }}>
      {!lead.conversation.length && !streaming && <div className="space-y-5"><div className="lead-soft-panel p-4 text-sm leading-relaxed text-[#655b56]">I know this lead’s saved details and analysis. Ask what to say next, how to respond to a concern, or for a shorter message.</div><div className="space-y-2.5">{suggestions.map((question) => <button type="button" key={question} disabled={busy} onClick={() => send(question)} className="block w-full rounded-xl border border-[#eadcd5] bg-white p-3.5 text-left text-xs font-medium leading-relaxed text-[#504844] transition-colors hover:border-[#e5b8b1] hover:bg-[#fff4f0] disabled:opacity-50">{question}</button>)}</div></div>}
      <div className="space-y-4">{lead.conversation.map((message) => <div key={message.id} className={message.role === "user" ? "ml-8 rounded-2xl rounded-br-sm bg-[#d94e53] p-4 text-sm leading-relaxed text-white" : "mr-5 rounded-2xl rounded-bl-sm border border-[#f0e4dd] bg-white p-4 text-sm leading-relaxed text-[#3b3633]"}><p className="whitespace-pre-wrap break-words leading-relaxed select-text">{message.text}</p>{message.role === "assistant" && <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-[#8f817a]">{message.stopped ? "Stopped early" : "Assistant"}</span><button type="button" onClick={() => copy(message.text)} className="text-[#8f817a] hover:text-[#b13d43]" aria-label="Copy answer"><Clipboard className="size-3.5" /></button></div>}</div>)}
        {streaming && <><div className="ml-8 rounded-2xl rounded-br-sm bg-[#d94e53] p-4 text-sm leading-relaxed text-white">{streaming.question}</div><div className="mr-5 rounded-2xl rounded-bl-sm border border-[#f0e4dd] bg-white p-4 text-sm leading-relaxed text-[#3b3633]"><span className="whitespace-pre-wrap break-words">{streaming.answer || "Thinking…"}</span></div></>}
      </div>
      {!nearBottom && <button type="button" className="sticky bottom-0 ml-auto flex items-center gap-1 rounded-full bg-[#d94e53] px-3 py-1.5 text-xs font-bold text-white shadow" onClick={() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); setNearBottom(true); }}><ArrowDown className="size-3" />Latest</button>}
    </div>
    <div className="border-t border-[#eadcd5] bg-[#fffefd] p-4"><div className="rounded-2xl border border-[#eadcd5] bg-[#fffcfa] p-2"><Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} disabled={!!streaming} maxLength={1000} placeholder="Ask about this lead…" className="min-h-18 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" aria-label="Ask the lead assistant" /><div className="flex items-center justify-between gap-2 px-1 pb-1"><span className="text-[10px] text-[#8f817a]">{input.length}/1000 · Enter to send</span>{streaming ? <Button size="sm" variant="outline" onClick={stop}><Square className="size-3.5" />Stop</Button> : <Button size="sm" disabled={!input.trim() || busy} onClick={() => void send()}><Send className="size-3.5" />Send</Button>}</div></div></div>
  </section>;
}
