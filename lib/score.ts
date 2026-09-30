import type { LeadAnalysis, LeadFields, LeadMessage } from "./lead-types";
import type { RawAnalysis } from "./ai-schemas";
import { hasEvidence, normalizeText } from "./normalize";
import { parseMoney } from "./money";

type Source = RawAnalysis["timelineSource"];

function findSupportedSource(source: Source, messages: LeadMessage[], fields: LeadFields, fieldKey?: keyof LeadFields): string | null {
  if (source.type === "none" || !source.text.trim()) return null;
  if (source.type === "field") {
    if (!fieldKey) return null;
    const value = fields[fieldKey].value;
    return value && normalizeText(value).includes(normalizeText(source.text)) ? source.text : null;
  }
  const message = messages.find((item) => item.id === source.messageId && item.included);
  return message && hasEvidence(message.text, source.text) ? source.text : null;
}

function isVisitOnlyTimeline(source: Source, messages: LeadMessage[]): boolean {
  if (source.type !== "message") return false;
  const message = messages.find((item) => item.id === source.messageId);
  if (!message) return false;
  const appointment = /\b(?:visit|viewing|tour|call|meeting|appointment)\b|विज़िट|विजिट|दौरा/i;
  const buying = /\b(?:buy|purchase|move|close|decide)\b|खरीद|लेना/i;
  if (appointment.test(source.text) && !buying.test(source.text)) return true;
  return !buying.test(message.text) && appointment.test(message.text);
}

function addMonths(date: Date, count: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + count);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

const hindiTime: Record<string, number> = { "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6 };
const englishTime: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

function timelinePoints(text: string, anchoredAt: string, now: Date): number {
  const normalized = normalizeText(text);
  let deadline: Date | null = null;
  const explicitDate = text.match(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/);
  if (explicitDate) deadline = new Date(`${explicitDate[1]}-${explicitDate[2].padStart(2, "0")}-${explicitDate[3].padStart(2, "0")}T12:00:00Z`);
  const quantityMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|दिन|हफ्ते|सप्ताह|महीने|महीना)/)
    ?? normalized.match(/\b(a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(days?|weeks?|months?)\b/)
    ?? normalized.match(/(एक|दो|तीन|चार|पांच|पाँच|छह)\s*(दिन|हफ्ते|सप्ताह|महीने|महीना)/);
  if (!deadline && quantityMatch) {
    const amount = Number(quantityMatch[1]) || englishTime[quantityMatch[1]] || hindiTime[quantityMatch[1]];
    const unit = quantityMatch[2];
    const anchor = new Date(anchoredAt);
    if (Number.isFinite(amount) && amount > 0 && amount <= 120 && !Number.isNaN(anchor.getTime())) {
      if (/month|महीन/.test(unit)) deadline = Number.isInteger(amount) ? addMonths(anchor, amount) : new Date(anchor.getTime() + Math.round(amount * 30.4375 * 86_400_000));
      else deadline = new Date(anchor.getTime() + amount * (/week|हफ्ते|सप्ताह/.test(unit) ? 7 : 1) * 86_400_000);
    }
  }
  if (!deadline && /\btomorrow\b|\bnext day\b|कल/.test(normalized)) deadline = new Date(new Date(anchoredAt).getTime() + 86_400_000);
  if (!deadline || Number.isNaN(deadline.getTime()) || deadline <= now) return 0;
  if (deadline <= addMonths(now, 1)) return 30;
  if (deadline <= addMonths(now, 3)) return 24;
  if (deadline <= addMonths(now, 6)) return 16;
  return 8;
}

function approximateTimelinePoints(months: number): number {
  if (months <= 1) return 30;
  if (months <= 3) return 24;
  if (months <= 6) return 16;
  return 8;
}

function budgetPoints(text: string): number {
  const money = parseMoney(text);
  if (!money) return 0;
  if (money.kind === "floor") return 8;
  if (money.kind === "ceiling") return 15;
  if (money.kind === "range") return money.amounts[1] > money.amounts[0] * 1.5 ? 8 : 20;
  return 20;
}

export function buildAnalysis(raw: RawAnalysis, fields: LeadFields, messages: LeadMessage[], now = new Date()): LeadAnalysis {
  const included = messages.filter((message) => message.included);
  const timelineEvidence = isVisitOnlyTimeline(raw.timelineSource, included) ? null : findSupportedSource(raw.timelineSource, included, fields, "timeline");
  const timelineMessage = included.find((message) => message.id === raw.timelineSource.messageId);
  const fieldEvidence = raw.timelineSource.type === "field" ? fields.timeline.evidence : null;
  const originalMessage = fieldEvidence ? [...included].reverse().find((message) => hasEvidence(message.text, fieldEvidence)) : null;
  const timelineAnchor = raw.timelineSource.type === "message" && timelineMessage ? timelineMessage.createdAt : originalMessage?.createdAt ?? now.toISOString();
  const parsedTimeline = timelineEvidence ? timelinePoints(timelineEvidence, timelineAnchor, now) : 0;
  const holidayTimeline = timelineEvidence && /diwali|deepavali|दिवाली|दीपावली/i.test(timelineEvidence) && raw.timelineMonths !== null;
  const timeline = holidayTimeline ? approximateTimelinePoints(raw.timelineMonths!) : parsedTimeline;

  const budgetEvidence = findSupportedSource(raw.budgetSource, included, fields, "budget");
  const budget = budgetEvidence ? budgetPoints(budgetEvidence) : 0;

  const categories = new Set<string>();
  const requirementEvidence: string[] = [];
  for (const detail of raw.requirementDetails) {
    const source = findSupportedSource(detail.source, included, fields, detail.category === "location" ? "location" : "requirement");
    if (source) { categories.add(detail.category); requirementEvidence.push(source); }
  }
  const requirements = Math.min(categories.size, 3) * 5;

  const buyingEvidence = findSupportedSource(raw.buyingSignal.source, included, fields);
  const buyingLevels = { none: 0, options: 10, engaged: 22, action: 35 } as const;
  const buyingSignals = buyingEvidence ? buyingLevels[raw.buyingSignal.level] : 0;

  const score = timeline + budget + requirements + buyingSignals;
  return {
    summary: raw.summary,
    intent: raw.intent,
    requirements: raw.requirements,
    concerns: raw.concerns,
    nextAction: raw.nextAction,
    suggestedReply: raw.suggestedReply,
    gaps: raw.gaps,
    conflicts: raw.conflicts,
    factors: {
      timeline: { points: timeline, maximum: 30, reason: holidayTimeline ? `Approximate timing after “${timelineEvidence}”; confirm the intended date.` : timelineEvidence ? `Based on “${timelineEvidence}”.` : "No clear current buying deadline.", evidence: timelineEvidence },
      budget: { points: budget, maximum: 20, reason: budgetEvidence ? `Based on “${budgetEvidence}”.` : "No clear usable budget.", evidence: budgetEvidence },
      requirements: { points: requirements, maximum: 15, reason: categories.size ? `${categories.size} distinct need ${categories.size === 1 ? "category" : "categories"} stated.` : "No specific property need stated.", evidence: requirementEvidence.join("; ") || null },
      buyingSignals: { points: buyingSignals, maximum: 35, reason: buyingEvidence ? raw.buyingSignal.reason : "No supported buying action stated.", evidence: buyingEvidence },
    },
    score,
    rubricVersion: 1,
    analyzedAt: now.toISOString(),
  };
}
