"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownUp, Download, Flame, MoreHorizontal, Plus, Search, Snowflake, Sun, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { priorityTag, type Lead } from "@/lib/lead-types";
import { cn } from "@/lib/utils";

const priorityVisual = {
  hot: { icon: Flame, text: "Hot", className: "bg-[#fce8e5] text-[#ad373e] ring-[#f0c8c2]" },
  warm: { icon: Sun, text: "Warm", className: "bg-[#fff1dc] text-[#925d17] ring-[#eed8b6]" },
  cold: { icon: Snowflake, text: "Cold", className: "bg-[#e9f1f4] text-[#436c7b] ring-[#cbdfe6]" },
} as const;

export function PriorityBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const value = priorityVisual[priorityTag(score)];
  const Icon = value.icon;
  return <span aria-label={`${value.text} lead, score ${score} out of 100`} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ring-inset", value.className)}><Icon className="size-3" aria-hidden />{!compact && value.text}<span>{score}</span></span>;
}

function leadName(lead: Lead): string { return lead.fields.name.value.trim() || "Unnamed lead"; }
function details(lead: Lead): string {
  return [lead.fields.location.value, lead.fields.requirement.value, lead.fields.budget.value].filter(Boolean).join(" · ") || "Details not provided";
}

export interface LeadSidebarProps {
  leads: Lead[];
  activeId: string | null;
  sort: "priority" | "newest";
  filter: "all" | "hot" | "warm" | "cold";
  busy: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onSort: (sort: "priority" | "newest") => void;
  onFilter: (filter: "all" | "hot" | "warm" | "cold") => void;
  onDelete: (lead: Lead) => void;
  onClear: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function LeadSidebar(props: LeadSidebarProps) {
  const [search, setSearch] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const counts = useMemo(() => ({
    all: props.leads.length,
    hot: props.leads.filter((lead) => priorityTag(lead.analysis.score) === "hot").length,
    warm: props.leads.filter((lead) => priorityTag(lead.analysis.score) === "warm").length,
    cold: props.leads.filter((lead) => priorityTag(lead.analysis.score) === "cold").length,
  }), [props.leads]);
  const visible = useMemo(() => props.leads.filter((lead) => {
    if (lead.id === props.activeId) return true;
    if (props.filter !== "all" && priorityTag(lead.analysis.score) !== props.filter) return false;
    const haystack = `${lead.fields.name.value} ${lead.fields.location.value} ${lead.fields.requirement.value}`.toLocaleLowerCase();
    return haystack.includes(search.trim().toLocaleLowerCase());
  }).sort((a, b) => props.sort === "priority"
    ? b.analysis.score - a.analysis.score || Date.parse(b.createdAt) - Date.parse(a.createdAt)
    : Date.parse(b.createdAt) - Date.parse(a.createdAt)), [props.leads, props.activeId, props.filter, props.sort, search]);
  const groups = props.sort === "priority" && props.filter === "all"
    ? (["hot", "warm", "cold"] as const).map((tag) => ({ tag, leads: visible.filter((lead) => priorityTag(lead.analysis.score) === tag) })).filter((group) => group.leads.length)
    : [{ tag: null, leads: visible }];

  return <aside className="flex h-full min-h-0 flex-col bg-[#f7e9e2]" aria-label="Saved leads">
    <div className="border-b border-[#e8d8d0] px-4 pb-5 pt-6 lg:px-5">
      <div className="flex items-center justify-between gap-2">
        <div><p className="lead-kicker">Workspace</p><h2 className="mt-2 text-[23px] font-extrabold tracking-[-0.05em] text-[#282626]">Leads <span className="ml-1 text-base font-semibold text-[#9b8c84]">{counts.all}</span></h2></div>
        <Button size="icon" className="size-10 rounded-xl shadow-[0_5px_14px_rgba(217,78,83,0.16)]" title="New lead" aria-label="New lead" disabled={props.busy} onClick={props.onNew}><Plus className="size-5" /></Button>
      </div>
      <div className="relative mt-6"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#a79085]" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or place" className="h-11 rounded-xl border-[#e8d8d0] bg-white pl-10 text-sm shadow-[0_2px_8px_rgba(85,55,43,0.03)]" aria-label="Search leads" /></div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#695e59] hover:text-[#b13d43]" onClick={() => props.onSort(props.sort === "priority" ? "newest" : "priority")}><ArrowDownUp className="size-3.5" />{props.sort === "priority" ? "Priority first" : "Newest first"}</button>
        <DropdownMenu><DropdownMenuTrigger render={<Button size="icon" variant="ghost" aria-label="Lead list options" />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={props.onExport}><Download className="size-4" />Export backup</DropdownMenuItem><DropdownMenuItem onClick={() => fileInput.current?.click()}><Upload className="size-4" />Import backup</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={props.onClear} disabled={props.busy || !props.leads.length}><Trash2 className="size-4" />Clear all leads</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.currentTarget.value = ""; }} aria-label="Import backup file" />
      </div>
      <div className="mt-5 flex gap-1 overflow-x-auto pb-1" aria-label="Filter leads">
        {(["all", "hot", "warm", "cold"] as const).map((value) => <button key={value} type="button" onClick={() => props.onFilter(value)} aria-pressed={props.filter === value} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold capitalize transition-colors", props.filter === value ? "bg-[#d94e53] text-white shadow-[0_3px_10px_rgba(217,78,83,0.13)]" : "text-[#786c66] hover:bg-white/70")}>{value} <span className="opacity-70">{counts[value]}</span></button>)}
      </div>
    </div>
    <ScrollArea className="min-h-0 flex-1"><div className="space-y-5 px-3 py-5">
      {!props.leads.length && <div className="px-4 py-14 text-center text-sm text-stone-500">Your leads will appear here after analysis.</div>}
      {!!props.leads.length && !visible.length && <div className="px-4 py-12 text-center text-sm text-stone-500">No leads match.<button className="mt-3 block w-full text-xs font-semibold text-stone-800 underline" onClick={() => { setSearch(""); props.onFilter("all"); }}>Clear search and filter</button></div>}
      {groups.map((group) => <div key={group.tag || "flat"}>
        {group.tag && <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#a18a80]">{group.tag} · {group.leads.length}</p>}
        <div className="space-y-2">{group.leads.map((lead) => <div key={lead.id} className={cn("group rounded-[17px] border transition-all", props.activeId === lead.id ? "border-[#eabdb5] bg-white shadow-[0_8px_24px_rgba(85,55,43,0.06)]" : "border-transparent hover:border-[#ebd9d0] hover:bg-white/70")}>
          <button type="button" disabled={props.busy && props.activeId !== lead.id} onClick={() => props.onOpen(lead.id)} className="w-full rounded-[17px] px-3.5 pb-1 pt-3.5 text-left disabled:cursor-not-allowed disabled:opacity-50" title={props.busy ? "Finish or stop the current task first" : undefined}>
            <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-extrabold tracking-tight text-[#282626]">{leadName(lead)}</span><PriorityBadge score={lead.analysis.score} compact /></div>
            <p className="mt-1.5 truncate text-xs text-[#746c68]">{details(lead)}</p>
            <p className="mt-2 text-[11px] text-[#9e8e86]" title={new Date(lead.createdAt).toLocaleString()}>{new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(lead.createdAt))}</p>
          </button>
          <button type="button" disabled={props.busy} onClick={() => props.onDelete(lead)} aria-label={`Delete ${leadName(lead)}`} className="mx-3 mb-2 inline-flex items-center gap-1 rounded-md px-1 py-1 text-[11px] font-bold text-[#b13d43] hover:bg-[#fff1ed] disabled:opacity-40"><Trash2 className="size-3" />Delete</button>
        </div>)}</div>
      </div>)}
    </div></ScrollArea>
    <div className="border-t border-[#e8d8d0] px-5 py-4 text-[11px] leading-relaxed text-[#8f817a]">Saved in this browser · Gemini handles AI requests · Export backups</div>
  </aside>;
}
