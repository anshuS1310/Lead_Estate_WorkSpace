"use client";

import { ArrowRight, ScanText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fieldKeys, type FieldKey, type LeadDraft } from "@/lib/lead-types";

const labels: Record<FieldKey, string> = {
  name: "Customer name", location: "Preferred location", requirement: "Property requirement", budget: "Budget", timeline: "Buying timeline",
};
const placeholders: Record<FieldKey, string> = {
  name: "As stated by the customer", location: "Area or city", requirement: "Type, size, or rooms", budget: "Amount or range", timeline: "When they plan to buy",
};

export function LeadIntake({ draft, saved, busy, onMessage, onField, onAutofill, onAnalyze }: {
  draft: LeadDraft;
  saved: boolean;
  busy: boolean;
  onMessage: (value: string) => void;
  onField: (key: FieldKey, value: string) => void;
  onAutofill: () => void;
  onAnalyze: () => void;
}) {
  return <section className="lead-surface p-5 sm:p-8" aria-label="Lead intake">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="lead-kicker">{saved ? "Review details" : "New lead"}</p><h1 className="mt-3 text-[27px] font-extrabold leading-[1.15] tracking-[-0.055em] text-[#282626] sm:text-[34px]">{saved ? "Update this lead" : "Start with their words"}</h1><p className="mt-3 max-w-xl text-sm leading-[1.75] text-[#746c68]">{saved ? "Edit the reviewed fields, then re-analyze. Earlier customer messages remain unchanged." : "Paste the customer’s message. Everything else is optional and can be filled automatically or by you."}</p></div><div className="flex size-12 items-center justify-center rounded-2xl bg-[#d94e53] text-white"><ScanText className="size-5" /></div></div>
    {!saved && <div className="mt-8"><label htmlFor="customer-message" className="text-sm font-bold text-[#282626]">Customer message <span className="text-[#d94e53]">*</span></label><Textarea id="customer-message" value={draft.message} onChange={(event) => onMessage(event.target.value)} maxLength={5000} disabled={busy} placeholder="Paste the customer's WhatsApp message, email, or chat transcript here…" className="mt-2.5 min-h-44 resize-y p-4 text-sm leading-relaxed" /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[#8d817b]">Use fictional leads in this pilot.</p><span className="text-xs tabular-nums text-[#8d817b]">{draft.message.length}/5000</span></div><Button variant="outline" size="sm" className="mt-4 border-[#e9bcb5] bg-white text-[#ad373e] hover:bg-[#fff2ee]" disabled={busy || !draft.message.trim()} onClick={onAutofill}><Sparkles className="size-4" />Autofill from message</Button></div>}
    <div className="mt-8 border-t border-[#f0e4dd] pt-7"><div className="mb-5 flex items-center justify-between"><h2 className="lead-section-title">Customer details</h2><span className="text-xs text-[#8d817b]">All optional</span></div><div className="grid gap-5 sm:grid-cols-2">{fieldKeys.map((key) => <div key={key} className={key === "requirement" ? "sm:col-span-2" : ""}><div className="flex items-center justify-between"><label htmlFor={`field-${key}`} className="text-xs font-bold text-[#504844]">{labels[key]}</label>{draft.fields[key].source === "ai" && <span className="text-[10px] font-bold text-[#b13d43]">AI filled</span>}</div><Input id={`field-${key}`} value={draft.fields[key].value} onChange={(event) => onField(key, event.target.value)} disabled={busy} maxLength={300} placeholder={placeholders[key]} className="mt-2 h-11 px-3.5" />{draft.fields[key].source === "ai" && draft.fields[key].evidence && <p className="mt-1.5 text-[11px] leading-relaxed text-[#8d817b]">From: “{draft.fields[key].evidence}”</p>}</div>)}</div></div>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#f0e4dd] pt-6"><p className="text-xs text-[#8d817b]">You stay in control of every detail and reply.</p><Button className="min-h-11 rounded-xl px-5 shadow-[0_6px_16px_rgba(217,78,83,0.14)]" disabled={busy || (!saved && !draft.message.trim())} onClick={onAnalyze}>{busy ? "Working…" : saved ? "Re-analyze" : "Analyze lead"}<ArrowRight className="size-4" /></Button></div>
  </section>;
}
