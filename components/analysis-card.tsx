"use client";

import { useState } from "react";
import { AlertCircle, ArrowUpRight, Check, ChevronDown, Clipboard, FileText, MessageSquareText, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PriorityBadge } from "@/components/lead-sidebar";
import { analysisSnapshot, type Lead } from "@/lib/lead-types";

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); }
  catch { toast.error("Copy was blocked. Select the text and copy it manually."); }
}

const intentLabels = { ready: "Ready to buy", comparing: "Actively comparing", researching: "Early research", browsing: "Just browsing" };

export interface AnalysisCardProps {
  lead: Lead;
  busy: boolean;
  onEdit: () => void;
  onReanalyze: () => void;
  onAddMessage: () => void;
  onToggleMessage: (id: string) => void;
  onDeleteMessage: (id: string) => void;
}

export function AnalysisCard({ lead, busy, onEdit, onReanalyze, onAddMessage, onToggleMessage, onDeleteMessage }: AnalysisCardProps) {
  const [showMessages, setShowMessages] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const analysis = lead.analysis;
  const stale = lead.analyzedSnapshot !== analysisSnapshot(lead.messages, lead.fields);
  const details = [lead.fields.location.value, lead.fields.requirement.value, lead.fields.budget.value, lead.fields.timeline.value].filter(Boolean);
  return <div className="space-y-6 pb-10">
    <div className="lead-surface p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="lead-kicker">Lead overview</span>{stale && <span className="rounded-full bg-[#fff1dc] px-2.5 py-1 text-[10px] font-bold text-[#925d17]">Changes not analyzed yet</span>}</div><h1 className="mt-3 break-words text-[28px] font-extrabold leading-[1.15] tracking-[-0.055em] text-[#282626] sm:text-[36px]">{lead.fields.name.value || "Unnamed lead"}</h1><p className="mt-2 text-sm leading-relaxed text-[#746c68]">{details.length ? details.join(" · ") : "Details not provided"}</p></div>
        <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>Edit details</Button><Button variant="outline" size="sm" onClick={onReanalyze} disabled={busy}><RefreshCw className="size-3.5" />Re-analyze</Button><Button variant="outline" size="sm" onClick={onAddMessage} disabled={busy}>Add customer message</Button></div>
      </div>
      <div className="mt-7 grid gap-5 border-t border-[#f0e4dd] pt-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-3"><PriorityBadge score={analysis.score} /><span className="text-[34px] font-extrabold tabular-nums tracking-[-0.06em] text-[#282626]">{analysis.score}<span className="text-base font-medium text-[#a0928b]">/100</span></span></div>
        <div><Progress value={analysis.score} aria-label={`Priority score ${analysis.score} out of 100`} className="h-2 bg-[#f4e4dc]" /><p className="mt-2 text-xs leading-relaxed text-[#746c68]">{intentLabels[analysis.intent.category]} · {analysis.intent.reason}</p></div>
      </div>
    </div>

    <div className="lead-surface p-5 sm:p-7"><h2 className="lead-section-title">At a glance</h2><p className="mt-4 text-[15px] leading-[1.8] text-[#3b3633]">{analysis.summary}</p></div>

    <section className="lead-surface p-5 sm:p-7" aria-labelledby="next-action-title"><div className="flex items-start gap-4"><div className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-[#d94e53] text-white"><ArrowUpRight className="size-5" /></div><div><h2 id="next-action-title" className="lead-section-title">Recommended next action</h2><p className="mt-3 text-lg font-bold leading-snug tracking-tight text-[#282626]">{analysis.nextAction.action}</p><p className="mt-2 text-sm text-[#746c68]">{analysis.nextAction.timing}</p></div></div></section>

    <div className="grid gap-5 sm:grid-cols-2"><InfoList title="What they want" items={analysis.requirements} empty="No specific requirements stated" /><InfoList title="What may hold them back" items={analysis.concerns} empty="No concerns signaled" /></div>

    {!!analysis.conflicts.length && <section className="rounded-[21px] border border-[#efd8b9] bg-[#fff7e9] p-5" aria-label="Details to resolve"><h2 className="flex items-center gap-2 text-sm font-bold text-[#7e551f]"><AlertCircle className="size-4" />Details to resolve</h2><ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#725a3a]">{analysis.conflicts.map((item, index) => <li key={index}>• {item}</li>)}</ul></section>}
    {!!analysis.gaps.length && <section className="lead-surface p-5 sm:p-6" aria-label="Ask this customer"><h2 className="lead-section-title">Ask this customer</h2><ol className="mt-4 list-inside list-decimal space-y-2 text-sm leading-relaxed text-[#655b56]">{analysis.gaps.map((item, index) => <li key={index}>{item}</li>)}</ol></section>}

    <section className="lead-surface p-5 sm:p-7" aria-label="Suggested reply"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-extrabold text-[#282626]"><MessageSquareText className="size-4 text-[#d94e53]" />Suggested reply</h2><Button variant="outline" size="sm" disabled={busy} onClick={() => copy(analysis.suggestedReply)}><Clipboard className="size-3.5" />Copy</Button></div><p className="lead-soft-panel mt-4 whitespace-pre-wrap break-words p-4 text-sm leading-[1.8] text-[#3b3633] select-text">{analysis.suggestedReply}</p></section>

    <section className="lead-surface overflow-hidden"><button type="button" aria-expanded={showScore} onClick={() => setShowScore(!showScore)} className="flex w-full items-center justify-between px-5 py-5 text-left text-sm font-bold text-[#282626]"><span className="flex items-center gap-2"><Sparkles className="size-4 text-[#d94e53]" />Why this score?</span><ChevronDown className={`size-4 transition-transform ${showScore ? "rotate-180" : ""}`} /></button>{showScore && <div className="grid gap-3 border-t border-[#f0e4dd] p-5 sm:grid-cols-2">{([
      ["Timeline", analysis.factors.timeline], ["Budget clarity", analysis.factors.budget], ["Requirements", analysis.factors.requirements], ["Buying signals", analysis.factors.buyingSignals],
    ] as const).map(([name, factor]) => <div key={name} className="lead-soft-panel p-4"><div className="flex items-center justify-between gap-2 text-sm font-bold"><span>{name}</span><span className="tabular-nums text-[#b13d43]">{factor.points}/{factor.maximum}</span></div><Progress value={factor.points / factor.maximum * 100} className="mt-3 h-1.5" /><p className="mt-3 text-xs leading-relaxed text-[#655b56]">{factor.reason}</p>{factor.evidence && <p className="mt-2 text-[11px] text-[#8f817a]">Source: {factor.evidence}</p>}</div>)}</div>}<p className="border-t border-[#f0e4dd] px-5 py-3 text-[11px] text-[#8f817a]">A prioritization estimate, not a prediction of a sale · Rubric v{analysis.rubricVersion}</p></section>

    <section className="lead-surface overflow-hidden"><button type="button" aria-expanded={showMessages} onClick={() => setShowMessages(!showMessages)} className="flex w-full items-center justify-between px-5 py-5 text-left text-sm font-bold text-[#282626]"><span className="flex items-center gap-2"><FileText className="size-4 text-[#d94e53]" />Customer messages <span className="font-medium text-[#8f817a]">{lead.messages.length}</span></span><ChevronDown className={`size-4 transition-transform ${showMessages ? "rotate-180" : ""}`} /></button>{showMessages && <div className="space-y-3 border-t border-[#f0e4dd] p-5">{lead.messages.map((message, index) => <div key={message.id} className="lead-soft-panel p-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-bold text-[#655b56]">Message {index + 1} · {message.included ? "Included" : "Excluded"}</span><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={busy || (message.included && lead.messages.filter((item) => item.included).length === 1)} onClick={() => onToggleMessage(message.id)}>{message.included ? "Exclude" : "Include"}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => onDeleteMessage(message.id)} aria-label={`Delete message ${index + 1}`} className="text-[#b13d43] hover:text-[#943039]"><Trash2 className="size-3.5" />Delete</Button></div></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#504844]">{message.text}</p></div>)}</div>}</section>
  </div>;
}

function InfoList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <section className="lead-surface p-5 sm:p-6"><h2 className="lead-section-title">{title}</h2>{items.length ? <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[#504844]">{items.map((item, index) => <li key={index} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-[#d94e53]" />{item}</li>)}</ul> : <p className="mt-4 text-sm text-[#8f817a]">{empty}</p>}</section>;
}
