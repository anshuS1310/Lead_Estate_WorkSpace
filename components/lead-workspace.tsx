"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, DatabaseZap, Menu, MessageCircle, Plus, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LeadSidebar } from "@/components/lead-sidebar";
import { LeadIntake } from "@/components/lead-intake";
import { AnalysisCard } from "@/components/analysis-card";
import { LeadChat } from "@/components/lead-chat";
import { analysisSchema, analysisSnapshot, fieldKeys, type FieldKey, type Lead, type LeadAnalysis, type LeadFields, type LeadMessage } from "@/lib/lead-types";
import { duplicateKey } from "@/lib/normalize";
import { exportData, hasUnsavedDraft, parseImport, useLeadStore } from "@/lib/lead-store";

type DialogState =
  | { type: "discard"; action: () => void }
  | { type: "duplicate"; lead: Lead; message: string }
  | { type: "deleteLead"; lead: Lead }
  | { type: "deleteMessage"; messageId: string }
  | { type: "clearAll" }
  | { type: "clearChat" }
  | { type: "import"; leads: Lead[]; skipped: number; collisions: number };

interface UpdatePreview {
  proposals: Partial<Record<FieldKey, { value: string | null; evidence: string | null }>>;
  analysis: LeadAnalysis;
  existingAnalysis: LeadAnalysis;
  pending: LeadMessage;
}

async function postJson<T>(url: string, input: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "The request failed. Your work is safe.");
  return body as T;
}

export function LeadWorkspace() {
  const hydrated = useLeadStore((state) => state.hydrated);
  const hydrate = useLeadStore((state) => state.hydrate);
  const workspace = useLeadStore((state) => state.workspace);
  const draft = useLeadStore((state) => state.draft);
  const storageError = useLeadStore((state) => state.storageError);
  const notice = useLeadStore((state) => state.notice);
  const conflict = useLeadStore((state) => state.conflict);
  const store = useLeadStore();
  const [busy, setBusy] = useState<null | "autofill" | "analysis" | "update" | "chat">(null);
  const [editorOpen, setEditorOpen] = useState<boolean | null>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [selectedMobileTab, setMobileTab] = useState<"details" | "analysis" | "chat" | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const pendingRemote = useRef(false);
  const activeLead = workspace.leads.find((lead) => lead.id === workspace.activeId);
  const mobileTab = selectedMobileTab ?? (activeLead ? "analysis" : "details");
  const showEditor = editorOpen ?? !activeLead;
  const dirty = hasUnsavedDraft(draft, activeLead);

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "lead-estate-workspace-v1") return;
      if (busy) { pendingRemote.current = true; return; }
      if (dirty) setExternalChange(true);
      else store.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [busy, dirty, store]);
  useEffect(() => {
    if (!busy && pendingRemote.current) { pendingRemote.current = false; setExternalChange(true); }
  }, [busy]);

  function navigate(action: () => void) {
    if (busy) return;
    if (dirty) setDialog({ type: "discard", action });
    else action();
  }
  function openLead(id: string) { navigate(() => { store.openLead(id); setEditorOpen(false); setMobileTab("analysis"); setMobileListOpen(false); setPreview(null); setShowAddMessage(false); }); }
  function newLead() { navigate(() => { store.newLead(); setEditorOpen(true); setMobileTab("details"); setMobileListOpen(false); setPreview(null); setShowAddMessage(false); }); }

  async function autofill() {
    if (!draft.message.trim() || busy) return;
    setBusy("autofill");
    try {
      const result = await postJson<{ fields: Partial<Record<FieldKey, { value: string | null; evidence: string | null }>> }>("/api/autofill", { message: draft.message });
      store.mergeAutofill(result.fields);
      const filled = fieldKeys.filter((key) => result.fields[key]?.value).length;
      toast.success(filled ? `Filled ${filled} of 5 details. Review them before analyzing.` : "No clear details found. You can enter them manually.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Autofill is unavailable."); }
    finally { setBusy(null); }
  }

  async function analyzeNew() {
    const text = draft.message.trim();
    if (!text) return;
    const message: LeadMessage = { id: crypto.randomUUID(), text: draft.message, createdAt: new Date().toISOString(), included: true };
    setBusy("analysis");
    try {
      const result = await postJson<{ analysis: LeadAnalysis }>("/api/analyze", { fields: draft.fields, messages: [message] });
      const analysis = analysisSchema.parse(result.analysis);
      const time = new Date().toISOString();
      const lead: Lead = { id: crypto.randomUUID(), createdAt: time, updatedAt: time, fields: draft.fields, messages: [message], pendingUpdate: null, analysis, analyzedSnapshot: analysisSnapshot([message], draft.fields), conversation: [] };
      if (store.saveLead(lead)) { setEditorOpen(false); setMobileTab("analysis"); toast.success("Lead analyzed and saved"); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Analysis failed. Your draft is safe."); }
    finally { setBusy(null); }
  }

  async function analyzeExisting(messages = activeLead?.messages, fields = draft.fields, pendingUpdate = activeLead?.pendingUpdate) {
    if (!activeLead || !messages) return;
    if (pendingUpdate?.trim()) { toast.message("Review or dismiss the pending customer message first."); return; }
    const lead = activeLead;
    const snapshot = analysisSnapshot(messages, fields);
    setBusy("analysis");
    try {
      const result = await postJson<{ analysis: LeadAnalysis }>("/api/analyze", { fields, messages });
      const analysis = analysisSchema.parse(result.analysis);
      if (store.saveLead({ ...lead, fields, messages, pendingUpdate: pendingUpdate ?? null, analysis, analyzedSnapshot: snapshot, updatedAt: new Date().toISOString() })) {
        setEditorOpen(false); setMobileTab("analysis"); setPreview(null); toast.success("Lead analysis updated");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Re-analysis failed. The previous result is safe."); }
    finally { setBusy(null); }
  }

  function analyze() {
    if (busy) return;
    if (activeLead) { void analyzeExisting(); return; }
    const key = duplicateKey(draft.fields);
    const match = key && workspace.leads.filter((lead) => duplicateKey(lead.fields) === key).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    if (match) setDialog({ type: "duplicate", lead: match, message: draft.message });
    else void analyzeNew();
  }

  function savePending(text: string) {
    if (!activeLead) return;
    store.setPending(activeLead.id, text || null);
  }

  async function reviewUpdate() {
    if (!activeLead?.pendingUpdate || busy) return;
    setBusy("update");
    try {
      const result = await postJson<UpdatePreview>("/api/review-update", { fields: draft.fields, messages: activeLead.messages, pendingMessage: activeLead.pendingUpdate });
      setPreview(result);
      toast.message("Review suggested changes before saving.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "The update could not be analyzed."); }
    finally { setBusy(null); }
  }

  function acceptUpdate() {
    if (!activeLead || !preview || preview.pending.text !== activeLead.pendingUpdate) { toast.error("The pending message changed. Review it again."); setPreview(null); return; }
    const fields: LeadFields = structuredClone(draft.fields);
    for (const key of fieldKeys) {
      const candidate = preview.proposals[key];
      if (candidate?.value) fields[key] = { value: candidate.value, source: "ai", evidence: candidate.evidence };
    }
    const messages = [...activeLead.messages, preview.pending];
    const updated: Lead = { ...activeLead, fields, messages, pendingUpdate: null, analysis: preview.analysis, analyzedSnapshot: analysisSnapshot(messages, fields), updatedAt: new Date().toISOString() };
    if (store.saveLead(updated)) { setPreview(null); setShowAddMessage(false); setMobileTab("analysis"); toast.success("New message and analysis saved"); }
  }

  function keepFieldsAndAnalyze() {
    if (!activeLead || !preview) return;
    const messages = [...activeLead.messages, preview.pending];
    const fields = draft.fields;
    const lead = activeLead;
    const analysis = analysisSchema.parse(preview.existingAnalysis);
    if (store.saveLead({ ...lead, fields, messages, pendingUpdate: null, analysis, analyzedSnapshot: analysisSnapshot(messages, fields), updatedAt: new Date().toISOString() })) { setPreview(null); setShowAddMessage(false); setMobileTab("analysis"); toast.success("Message analyzed with your existing details"); }
  }

  function addWithoutAnalysis() {
    if (!activeLead?.pendingUpdate?.trim()) return;
    const message: LeadMessage = { id: crypto.randomUUID(), text: activeLead.pendingUpdate, createdAt: new Date().toISOString(), included: true };
    if (store.saveLead({ ...activeLead, messages: [...activeLead.messages, message], pendingUpdate: null, updatedAt: new Date().toISOString() }, true)) { setShowAddMessage(false); setPreview(null); toast.message("Message saved. Re-analyze when you are ready."); }
  }

  function exportBackup() {
    const blob = new Blob([exportData(workspace.leads)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `lead-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded. Keep the file private.");
  }

  async function importBackup(file: File) {
    if (file.size > 10_000_000) { toast.error("That backup is too large to import here."); return; }
    try {
      const parsed = parseImport(JSON.parse(await file.text()));
      const ids = new Set(workspace.leads.map((lead) => lead.id));
      const collisions = parsed.valid.filter((lead) => ids.has(lead.id)).length;
      setDialog({ type: "import", leads: parsed.valid, skipped: parsed.skipped, collisions });
    } catch { toast.error("This is not a valid lead workspace backup."); }
  }

  function completeImport(asCopies: boolean) {
    if (dialog?.type !== "import") return;
    const ids = new Set(workspace.leads.map((lead) => lead.id));
    const imported = dialog.leads.flatMap((lead) => {
      if (!ids.has(lead.id)) { ids.add(lead.id); return [lead]; }
      if (!asCopies) return [];
      const now = new Date().toISOString();
      return [{ ...lead, id: crypto.randomUUID(), createdAt: now, updatedAt: now }];
    });
    if (imported.length) store.importLeads(imported);
    toast.success(`${imported.length} lead${imported.length === 1 ? "" : "s"} imported${dialog.skipped ? `; ${dialog.skipped} damaged entries skipped` : ""}.`);
    setDialog(null);
  }

  function confirmDialog() {
    if (!dialog) return;
    switch (dialog.type) {
      case "discard": dialog.action(); break;
      case "deleteLead": {
        const removed = store.removeLead(dialog.lead.id);
        if (removed) toast.success("Lead deleted", { action: { label: "Undo", onClick: () => store.restoreLead(removed) }, duration: 7000 });
        break;
      }
      case "deleteMessage": if (activeLead) store.setMessages(activeLead.id, activeLead.messages.filter((message) => message.id !== dialog.messageId)); break;
      case "clearAll": store.clearAll(); setEditorOpen(true); break;
      case "clearChat": if (activeLead) store.clearChat(activeLead.id); break;
      case "duplicate": {
        store.setPending(dialog.lead.id, dialog.message);
        store.openLead(dialog.lead.id);
        setEditorOpen(false); setMobileTab("analysis");
        toast.message("Existing lead opened. The new message is waiting for review.");
        break;
      }
      case "import": break;
    }
    setDialog(null);
  }

  const sidebarProps = {
    leads: workspace.leads, activeId: workspace.activeId, sort: workspace.sort, filter: workspace.filter, busy: !!busy,
    onOpen: openLead, onNew: newLead, onSort: store.setSort, onFilter: store.setFilter,
    onDelete: (lead: Lead) => { setMobileListOpen(false); setDialog({ type: "deleteLead", lead }); }, onClear: () => { setMobileListOpen(false); setDialog({ type: "clearAll" }); },
    onExport: exportBackup, onImport: importBackup,
  };

  if (!hydrated) return <div className="grid min-h-screen grid-cols-1 gap-5 bg-[#fbf2ed] p-5 lg:grid-cols-[280px_1fr_350px]"><Skeleton className="h-[90vh] rounded-[22px] bg-white" /><Skeleton className="h-[90vh] rounded-[22px] bg-white" /><Skeleton className="hidden h-[90vh] rounded-[22px] bg-white lg:block" /></div>;

  const pendingPanel = activeLead && (showAddMessage || activeLead.pendingUpdate !== null) && <section className="lead-surface p-5 sm:p-7" aria-label="New customer message"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold text-[#282626]">New customer message</h2><span className="rounded-full bg-[#fcebe7] px-3 py-1 text-[11px] font-bold text-[#a7383d]">Not analyzed yet</span></div><p className="mt-2 text-sm text-[#746c68]">Paste their latest words. This text is saved while you review it.</p><Textarea className="mt-4 min-h-32 bg-[#fffcfa] p-4" maxLength={5000} value={activeLead.pendingUpdate || ""} onChange={(event) => { savePending(event.target.value); setPreview(null); }} disabled={!!busy} placeholder="Paste the new customer message…" /><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" disabled={!activeLead.pendingUpdate?.trim() || !!busy} onClick={() => void reviewUpdate()}><Sparkles className="size-3.5" />Review & analyze</Button><Button size="sm" variant="outline" disabled={!activeLead.pendingUpdate?.trim() || !!busy} onClick={addWithoutAnalysis}>Add without analysis</Button><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { savePending(""); setShowAddMessage(false); setPreview(null); }}>Dismiss</Button></div></section>;

  const previewPanel = preview && activeLead && <section className="lead-surface p-5 sm:p-7" aria-label="Review suggested changes"><p className="lead-kicker">Review before saving</p><h2 className="mt-2 text-xl font-extrabold tracking-tight text-[#282626]">Suggested changes from the new message</h2><div className="mt-5 space-y-2">{fieldKeys.filter((key) => preview.proposals[key]?.value).map((key) => <div key={key} className="lead-soft-panel grid gap-1 p-4 text-sm sm:grid-cols-[130px_1fr]"><span className="font-bold capitalize text-[#655b56]">{key}</span><div><p className="text-[#8f817a] line-through">{draft.fields[key].value || "Not provided"}</p><p className="font-bold text-[#282626]">{preview.proposals[key]?.value}</p><p className="text-xs text-[#8f817a]">From: “{preview.proposals[key]?.evidence}”{draft.fields[key].source === "human" ? " · Replaces your entry only if you accept all" : ""}</p></div></div>)}{!fieldKeys.some((key) => preview.proposals[key]?.value) && <p className="text-sm text-[#746c68]">No new details found. The message can still update the analysis.</p>}</div><div className="lead-soft-panel mt-5 p-4"><p className="lead-kicker">Provisional priority</p><p className="mt-2 text-2xl font-extrabold tracking-tight text-[#282626]">{preview.analysis.score}/100</p><p className="mt-2 text-sm leading-relaxed text-[#655b56]">{preview.analysis.summary}</p>{preview.analysis.conflicts.length > 0 && <div className="mt-4 border-t border-[#eadcd5] pt-4"><p className="text-xs font-bold text-[#925d17]">Conflicts to review</p><ul className="mt-2 list-inside list-disc text-sm text-[#655b56]">{preview.analysis.conflicts.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</div><div className="mt-5 flex flex-wrap gap-2"><Button size="sm" onClick={acceptUpdate}>Accept changes and save analysis</Button><Button size="sm" variant="outline" onClick={() => void keepFieldsAndAnalyze()} disabled={!!busy}>Keep my fields and save analysis</Button><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Cancel</Button></div></section>;

  const desktopDetailsVisible = !activeLead || showEditor || Boolean(pendingPanel) || Boolean(previewPanel);
  const workContent = <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6 sm:px-7 sm:py-9 lg:px-8 xl:py-10">
    <div className={`${mobileTab === "details" ? "space-y-5" : "hidden"} ${desktopDetailsVisible ? "xl:block" : "xl:hidden"} xl:space-y-5`}>
      {!activeLead && <LeadIntake draft={draft} saved={false} busy={!!busy} onMessage={store.setDraftMessage} onField={store.setDraftField} onAutofill={() => void autofill()} onAnalyze={analyze} />}
      {activeLead && <div className={showEditor ? "block" : "xl:hidden"}><LeadIntake draft={draft} saved busy={!!busy} onMessage={store.setDraftMessage} onField={store.setDraftField} onAutofill={() => void autofill()} onAnalyze={analyze} /></div>}
      {activeLead && pendingPanel}
      {activeLead && previewPanel}
    </div>
    <div className={mobileTab === "analysis" ? "block" : "hidden xl:block"}>
      {activeLead?.pendingUpdate && <div className="mb-5 rounded-xl border border-[#efc9c2] bg-[#fff3ef] px-4 py-3 text-sm font-medium text-[#863238] xl:hidden">A new customer message is waiting in Details. The score has not changed yet.</div>}
      {activeLead && <AnalysisCard lead={activeLead} busy={!!busy} onEdit={() => { setEditorOpen(!showEditor); setMobileTab("details"); }} onReanalyze={() => void analyzeExisting()} onAddMessage={() => { setShowAddMessage(true); setMobileTab("details"); }} onToggleMessage={(id) => store.setMessages(activeLead.id, activeLead.messages.map((message) => message.id === id ? { ...message, included: !message.included } : message))} onDeleteMessage={(id) => setDialog(activeLead.messages.length === 1 ? { type: "deleteLead", lead: activeLead } : { type: "deleteMessage", messageId: id })} />}
      {!activeLead && <div className="lead-surface px-8 py-16 text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#fce9e6] text-[#d94e53]"><DatabaseZap className="size-6" /></div><h2 className="mt-5 text-xl font-extrabold tracking-tight text-[#282626]">Your next lead starts here</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#746c68]">Enter a customer message in Details. The analysis and reply will appear here after you press Analyze.</p></div>}
    </div>
  </div>;

  return <div className="lead-app flex h-screen min-h-[600px] flex-col overflow-hidden">
    <Toaster position="bottom-right" richColors closeButton />
    {(storageError || conflict || externalChange || notice) && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950" role="status"><span className="flex items-center gap-2"><ShieldAlert className="size-4" />{storageError || (conflict || externalChange ? "Another tab changed your leads. Reload this tab before making more changes." : notice)}</span><div className="flex gap-2">{(conflict || externalChange) && <button className="font-semibold underline" onClick={() => navigate(() => { store.reload(); setExternalChange(false); setPreview(null); })}>Reload</button>}{notice && <button className="font-semibold underline" onClick={store.clearNotice}>Dismiss</button>}</div></div>}
    <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-[#eadcd5] bg-[#fff7f2] px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open lead list" onClick={() => setMobileListOpen(true)}><Menu className="size-5" /></Button><div className="flex size-10 items-center justify-center rounded-[13px] bg-[#d94e53] text-white shadow-[0_6px_16px_rgba(217,78,83,0.18)]"><Sparkles className="size-5" /></div><span className="text-[15px] font-extrabold tracking-[-0.04em] sm:text-lg">Lead Workspace</span><span className="hidden rounded-full border border-[#edccc4] bg-[#fff1ec] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#b13d43] sm:inline">Pilot</span></div><div className="flex items-center gap-3"><span className="hidden text-xs font-medium text-[#81736d] md:inline">Nothing is sent to customers</span>{busy && <span className="flex items-center gap-1 text-xs font-semibold text-[#a7383d]"><RefreshCw className="size-3 animate-spin motion-reduce:animate-none" />Working</span>}<Button size="sm" variant="outline" className="lg:hidden" onClick={newLead} disabled={!!busy}><Plus className="size-4" />New</Button></div></div>
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_356px]">
      <div className="hidden min-h-0 border-r border-[#eadcd5] lg:block"><LeadSidebar {...sidebarProps} /></div>
      <main className="min-h-0 overflow-y-auto">
        <div className="border-b border-[#eadcd5] bg-[#fff7f2] px-4 py-3 xl:hidden"><div className="mx-auto flex max-w-[900px] gap-1 rounded-xl bg-[#f2e3dc] p-1">{(["details", "analysis", "chat"] as const).map((tab) => <button key={tab} type="button" aria-pressed={mobileTab === tab} onClick={() => setMobileTab(tab)} className={`min-h-9 flex-1 rounded-[10px] px-2 py-2 text-xs font-bold capitalize transition-colors sm:text-sm ${mobileTab === tab ? "bg-white text-[#a7383d] shadow-sm" : "text-[#746c68] hover:text-[#282626]"}`}>{tab}</button>)}</div></div>
        <div className={mobileTab === "chat" ? "hidden xl:block" : "block"}>{workContent}</div>
        <div className={`h-[calc(100%-62px)] ${mobileTab === "chat" ? "block" : "hidden"} xl:hidden`}>{activeLead ? <LeadChat key={activeLead.id} lead={activeLead} busy={!!busy} onBusy={(value) => setBusy(value ? "chat" : null)} onSave={store.appendChat} onClear={() => setDialog({ type: "clearChat" })} /> : <div className="flex h-full flex-col items-center justify-center px-8 text-center"><div className="flex size-14 items-center justify-center rounded-2xl bg-[#fce9e6] text-[#d94e53]"><MessageCircle className="size-6" /></div><p className="mt-4 max-w-xs text-sm leading-relaxed text-[#746c68]">Analyze a lead to start a conversation.</p></div>}</div>
      </main>
      <div className="hidden min-h-0 border-l border-[#eadcd5] xl:block">{activeLead ? <LeadChat key={activeLead.id} lead={activeLead} busy={!!busy} onBusy={(value) => setBusy(value ? "chat" : null)} onSave={store.appendChat} onClear={() => setDialog({ type: "clearChat" })} /> : <div className="flex h-full flex-col items-center justify-center bg-[#fff7f2] p-8 text-center"><div className="flex size-14 items-center justify-center rounded-2xl bg-[#fce9e6] text-[#d94e53]"><MessageCircle className="size-6" /></div><p className="mt-4 max-w-xs text-sm leading-relaxed text-[#746c68]">The lead assistant will appear here after analysis.</p></div>}</div>
    </div>
    <Sheet open={mobileListOpen} onOpenChange={setMobileListOpen}><SheetContent side="left" className="w-[330px] max-w-[88vw] gap-0 border-[#eadcd5] p-0"><SheetTitle className="sr-only">Saved leads</SheetTitle><LeadSidebar {...sidebarProps} /></SheetContent></Sheet>
    <AlertDialog open={!!dialog} onOpenChange={(open) => { if (!open) setDialog(null); }}><AlertDialogContent className="max-w-md rounded-[22px] border-[#eadcd5] bg-[#fffefd] p-6 shadow-2xl"><AlertDialogHeader><AlertDialogTitle>{dialog?.type === "discard" ? "Discard changes?" : dialog?.type === "duplicate" ? "Possible duplicate lead" : dialog?.type === "deleteLead" ? "Delete this lead?" : dialog?.type === "deleteMessage" ? "Delete this message?" : dialog?.type === "clearAll" ? "Clear all leads?" : dialog?.type === "clearChat" ? "Clear this conversation?" : "Import backup"}</AlertDialogTitle><AlertDialogDescription>{dialog?.type === "discard" ? "Your edits have not been analyzed. Leaving will discard them." : dialog?.type === "duplicate" ? `A lead with the same reviewed details already exists: ${dialog.lead.fields.name.value || "Unnamed lead"}. Open it and keep this new message for review, or create a separate lead.` : dialog?.type === "deleteLead" ? `Delete ${dialog.lead.fields.name.value || "this unnamed lead"} and its conversation? You can undo for a few seconds.` : dialog?.type === "deleteMessage" ? "This customer message will be removed. The current score will remain until you re-analyze." : dialog?.type === "clearAll" ? "This removes every saved lead and conversation from this browser. Export a backup first if you need one." : dialog?.type === "clearChat" ? "This removes the conversation for this lead. Its analysis remains." : dialog?.type === "import" ? `${dialog.leads.length} valid leads found, ${dialog.skipped} damaged entries skipped, ${dialog.collisions} ID collisions. Choose how to handle matches.` : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-wrap"><AlertDialogCancel onClick={() => setDialog(null)}>{dialog?.type === "duplicate" ? "Cancel" : "Keep editing"}</AlertDialogCancel>{dialog?.type === "import" ? <><Button variant="outline" onClick={() => completeImport(false)}>Skip matches</Button><Button onClick={() => completeImport(true)}>Import matches as copies</Button></> : dialog?.type === "duplicate" ? <><Button variant="outline" onClick={() => { setDialog(null); void analyzeNew(); }}>Create separate</Button><AlertDialogAction onClick={confirmDialog}>Open existing</AlertDialogAction></> : <AlertDialogAction variant={dialog?.type === "deleteLead" || dialog?.type === "clearAll" || dialog?.type === "deleteMessage" ? "destructive" : "default"} onClick={confirmDialog}>{dialog?.type === "discard" ? "Discard" : dialog?.type === "clearAll" ? "Clear all" : dialog?.type === "clearChat" ? "Clear conversation" : "Confirm"}<ArrowRight className="size-3.5" /></AlertDialogAction>}</AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
