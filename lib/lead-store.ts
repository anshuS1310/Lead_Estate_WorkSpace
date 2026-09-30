"use client";

import { create } from "zustand";
import { z } from "zod";
import {
  draftSchema, emptyDraft, fieldKeys, leadSchema, workspaceSchema,
  type ChatMessage, type Lead, type LeadDraft, type LeadFields, type LeadMessage,
} from "./lead-types";

const WORKSPACE_KEY = "lead-estate-workspace-v1";
const DRAFT_KEY = "lead-estate-draft-v1";
let lastPersistedRevision = 0;

interface PersistedWorkspace {
  version: 1;
  revision: number;
  leads: Lead[];
  activeId: string | null;
  sort: "priority" | "newest";
  filter: "all" | "hot" | "warm" | "cold";
}

const freshWorkspace = (): PersistedWorkspace => ({ version: 1, revision: 0, leads: [], activeId: null, sort: "priority", filter: "all" });

function readWorkspace(): { data: PersistedWorkspace; skipped: number; error: string | null } {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) { lastPersistedRevision = 0; return { data: freshWorkspace(), skipped: 0, error: null }; }
    const candidate = workspaceSchema.parse(JSON.parse(raw));
    const leads: Lead[] = [];
    let skipped = 0;
    for (const item of candidate.leads) {
      const result = leadSchema.safeParse(item);
      if (result.success) leads.push(result.data);
      else skipped++;
    }
    const activeId = candidate.activeId && leads.some((lead) => lead.id === candidate.activeId) ? candidate.activeId : null;
    lastPersistedRevision = candidate.revision;
    return { data: { ...candidate, leads, activeId }, skipped, error: null };
  } catch {
    return { data: freshWorkspace(), skipped: 0, error: "History could not be read on this browser. Work will stay in memory." };
  }
}

function readDraft(): LeadDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft();
    return draftSchema.parse(JSON.parse(raw));
  } catch { return emptyDraft(); }
}

function writeDraft(draft: LeadDraft): string | null {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); return null; }
  catch { return "This browser could not save your current draft."; }
}

function writeWorkspace(previous: PersistedWorkspace, next: PersistedWorkspace): { data: PersistedWorkspace; error: string | null; conflict: boolean } {
  const updated = { ...next, revision: previous.revision + 1 };
  try {
    const stored = localStorage.getItem(WORKSPACE_KEY);
    if (stored) {
      const revision = Number(JSON.parse(stored)?.revision);
      if (revision !== lastPersistedRevision) return { data: previous, error: "Another tab changed your leads. Reload this tab before editing again.", conflict: true };
    } else if (lastPersistedRevision !== 0) {
      return { data: previous, error: "Lead history changed in another tab. Reload before editing.", conflict: true };
    }
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(updated));
    lastPersistedRevision = updated.revision;
    return { data: updated, error: null, conflict: false };
  } catch {
    return { data: updated, error: "History cannot be saved on this browser. Export your leads before closing it.", conflict: false };
  }
}

function sameFields(a: LeadFields, b: LeadFields): boolean {
  return fieldKeys.every((key) => a[key].value === b[key].value && a[key].source === b[key].source);
}

export function hasUnsavedDraft(draft: LeadDraft, lead: Lead | undefined): boolean {
  if (!lead) return Boolean(draft.message.trim() || fieldKeys.some((key) => draft.fields[key].value.trim()));
  return draft.leadId === lead.id && !sameFields(draft.fields, lead.fields);
}

interface LeadState {
  hydrated: boolean;
  workspace: PersistedWorkspace;
  draft: LeadDraft;
  notice: string | null;
  storageError: string | null;
  conflict: boolean;
  hydrate: () => void;
  reload: () => void;
  setDraftMessage: (message: string) => void;
  setDraftField: (key: keyof LeadFields, value: string) => void;
  mergeAutofill: (fields: Partial<Record<keyof LeadFields, { value: string | null; evidence: string | null }>>) => void;
  openLead: (id: string) => void;
  newLead: () => void;
  setSort: (sort: PersistedWorkspace["sort"]) => void;
  setFilter: (filter: PersistedWorkspace["filter"]) => void;
  saveLead: (lead: Lead, preserveDraft?: boolean) => boolean;
  setPending: (id: string, text: string | null) => void;
  setMessages: (id: string, messages: LeadMessage[]) => void;
  appendChat: (id: string, messages: ChatMessage[]) => void;
  clearChat: (id: string) => void;
  removeLead: (id: string) => Lead | null;
  restoreLead: (lead: Lead) => void;
  clearAll: () => void;
  importLeads: (leads: Lead[]) => void;
  clearNotice: () => void;
}

export const useLeadStore = create<LeadState>((set, get) => {
  const commit = (next: PersistedWorkspace): boolean => {
    const result = writeWorkspace(get().workspace, next);
    set({ workspace: result.data, storageError: result.error, conflict: result.conflict });
    return !result.conflict;
  };
  const replaceDraft = (draft: LeadDraft) => {
    const error = writeDraft(draft);
    set({ draft, storageError: error || get().storageError });
  };
  const changeLead = (id: string, fn: (lead: Lead) => Lead) => {
    const current = get().workspace;
    commit({ ...current, leads: current.leads.map((lead) => lead.id === id ? fn(lead) : lead) });
  };
  return {
    hydrated: false,
    workspace: freshWorkspace(),
    draft: emptyDraft(),
    notice: null,
    storageError: null,
    conflict: false,
    hydrate() {
      const loaded = readWorkspace();
      let draft = readDraft();
      if (draft.leadId !== loaded.data.activeId) {
        const active = loaded.data.leads.find((lead) => lead.id === loaded.data.activeId);
        draft = emptyDraft(active?.id ?? null, active?.fields);
      }
      set({ hydrated: true, workspace: loaded.data, draft, storageError: loaded.error, notice: loaded.skipped ? `${loaded.skipped} damaged lead ${loaded.skipped === 1 ? "entry was" : "entries were"} skipped.` : null });
    },
    reload() {
      const loaded = readWorkspace();
      const active = loaded.data.leads.find((lead) => lead.id === loaded.data.activeId);
      const draft = emptyDraft(active?.id ?? null, active?.fields);
      replaceDraft(draft);
      set({ workspace: loaded.data, draft, conflict: false, storageError: loaded.error, notice: "Lead history was refreshed from this browser." });
    },
    setDraftMessage(message) { replaceDraft({ ...get().draft, message }); },
    setDraftField(key, value) {
      const draft = get().draft;
      replaceDraft({ ...draft, fields: { ...draft.fields, [key]: { value, source: value ? "human" : "empty", evidence: null } } });
    },
    mergeAutofill(fields) {
      const draft = get().draft;
      const next = structuredClone(draft.fields);
      for (const key of fieldKeys) {
        const candidate = fields[key];
        if (!candidate?.value || next[key].source === "human") continue;
        next[key] = { value: candidate.value, source: "ai", evidence: candidate.evidence };
      }
      replaceDraft({ ...draft, fields: next });
    },
    openLead(id) {
      const current = get().workspace;
      const lead = current.leads.find((item) => item.id === id);
      if (!lead) return;
      const filter = current.filter !== "all" ? "all" : current.filter;
      if (commit({ ...current, activeId: id, filter })) replaceDraft(emptyDraft(id, lead.fields));
    },
    newLead() {
      const current = get().workspace;
      if (commit({ ...current, activeId: null })) replaceDraft(emptyDraft());
    },
    setSort(sort) { const current = get().workspace; commit({ ...current, sort }); },
    setFilter(filter) { const current = get().workspace; commit({ ...current, filter }); },
    saveLead(lead, preserveDraft = false) {
      const current = get().workspace;
      const exists = current.leads.some((item) => item.id === lead.id);
      const leads = exists ? current.leads.map((item) => item.id === lead.id ? lead : item) : [lead, ...current.leads];
      const okay = commit({ ...current, leads, activeId: lead.id });
      if (okay && !preserveDraft) replaceDraft(emptyDraft(lead.id, lead.fields));
      return okay;
    },
    setPending(id, text) { changeLead(id, (lead) => ({ ...lead, pendingUpdate: text, updatedAt: new Date().toISOString() })); },
    setMessages(id, messages) { changeLead(id, (lead) => ({ ...lead, messages, updatedAt: new Date().toISOString() })); },
    appendChat(id, messages) { changeLead(id, (lead) => ({ ...lead, conversation: [...lead.conversation, ...messages].slice(-100), updatedAt: new Date().toISOString() })); },
    clearChat(id) { changeLead(id, (lead) => ({ ...lead, conversation: [], updatedAt: new Date().toISOString() })); },
    removeLead(id) {
      const current = get().workspace;
      const removed = current.leads.find((lead) => lead.id === id) ?? null;
      if (!removed) return null;
      const okay = commit({ ...current, leads: current.leads.filter((lead) => lead.id !== id), activeId: current.activeId === id ? null : current.activeId });
      if (okay && current.activeId === id) replaceDraft(emptyDraft());
      return okay ? removed : null;
    },
    restoreLead(lead) { const current = get().workspace; commit({ ...current, leads: [...current.leads, lead] }); },
    clearAll() { const current = get().workspace; if (commit({ ...current, leads: [], activeId: null })) replaceDraft(emptyDraft()); },
    importLeads(leads) { const current = get().workspace; commit({ ...current, leads: [...current.leads, ...leads] }); },
    clearNotice() { set({ notice: null }); },
  };
});

export function parseImport(raw: unknown): { valid: Lead[]; skipped: number } {
  const envelope = z.object({ version: z.literal(1), leads: z.array(z.unknown()) }).parse(raw);
  const valid: Lead[] = [];
  let skipped = 0;
  for (const item of envelope.leads) {
    const parsed = leadSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
    else skipped++;
  }
  return { valid, skipped };
}

export function exportData(leads: Lead[]): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), leads }, null, 2);
}
