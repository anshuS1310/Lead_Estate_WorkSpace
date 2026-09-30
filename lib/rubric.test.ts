import { describe, expect, it } from "vitest";
import { emptyFields, priorityTag, type LeadMessage } from "./lead-types";
import type { RawAnalysis } from "./ai-schemas";
import { moneyMatches, parseMoney, verifiedBudgetValue } from "./money";
import { hasSafeSuggestedReply } from "./reply-safety";
import { buildAnalysis } from "./score";

const now = new Date("2026-09-30T12:00:00.000Z");
const none = { type: "none" as const, text: "", messageId: null };

function message(text: string, createdAt = now.toISOString()): LeadMessage {
  return { id: "message-1", text, createdAt, included: true };
}

function analysis(overrides: Partial<RawAnalysis> = {}): RawAnalysis {
  return {
    summary: "Customer inquiry.", intent: { category: "researching", reason: "Initial inquiry" },
    requirements: [], concerns: [], nextAction: { action: "Follow up", timing: "Soon" },
    suggestedReply: "I will check the details and get back to you.", gaps: [], conflicts: [],
    timelineSource: none, timelineMonths: null, budgetSource: none, requirementDetails: [],
    buyingSignal: { level: "none", source: none, reason: "No action" }, ...overrides,
  };
}

describe("budget evidence and scoring", () => {
  it("accepts equivalent crore, lakh and Devanagari values", () => {
    expect(moneyMatches("0.8 crore", "80 lakh")).toBe(true);
    expect(moneyMatches("80 lakh", "८० लाख")).toBe(true);
    expect(moneyMatches("80 lakh", "eighty lakh")).toBe(true);
    expect(moneyMatches("80 lakh", "₹80,00,000")).toBe(true);
    expect(moneyMatches("90 lakh", "80 lakh")).toBe(false);
    expect(moneyMatches("80 lakh", "3BHK with a budget of 80 lakh")).toBe(true);
  });

  it("keeps floors and ceilings distinct from exact amounts", () => {
    expect(moneyMatches("90 lakh", "up to 90 lakh")).toBe(false);
    expect(verifiedBudgetValue("90 lakh", "up to 90 lakh")).toBe("Up to 90 lakh");
    expect(verifiedBudgetValue("90 lakh", "up to 80 lakh")).toBe(null);
    expect(moneyMatches("minimum 50 lakh", "at least 50 lakhs")).toBe(true);
    expect(parseMoney("70 to 90 lakhs")?.kind).toBe("range");
  });

  it("scores a one-month purchase plan as Warm", () => {
    const text = "I want to buy within 1 month.";
    const result = buildAnalysis(analysis({ timelineSource: { type: "message", text: "within 1 month", messageId: "message-1" } }), emptyFields(), [message(text)], now);
    expect(result.factors.timeline.points).toBe(30);
    expect(priorityTag(result.score)).toBe("warm");
  });

  it("parses spelled-out English durations", () => {
    const text = "I want to buy within one month.";
    const result = buildAnalysis(analysis({ timelineSource: { type: "message", text, messageId: "message-1" } }), emptyFields(), [message(text)], now);
    expect(result.factors.timeline.points).toBe(30);
  });

  it("scores a visit request as a buying action without inventing a purchase timeline", () => {
    const text = "Can I visit tomorrow?";
    const result = buildAnalysis(analysis({ timelineSource: { type: "message", text: "tomorrow", messageId: "message-1" }, buyingSignal: { level: "action", source: { type: "message", text, messageId: "message-1" }, reason: "Requested a visit" } }), emptyFields(), [message(text)], now);
    expect(result.factors.timeline.points).toBe(0);
    expect(result.factors.buyingSignals.points).toBe(35);
    expect(priorityTag(result.score)).toBe("warm");
  });

  it("counts location, property type and rooms as three distinct categories", () => {
    const text = "3BHK apartment in Vijay Nagar";
    const source = (quote: string) => ({ type: "message" as const, text: quote, messageId: "message-1" });
    const result = buildAnalysis(analysis({ requirementDetails: [
      { category: "location", source: source("Vijay Nagar") },
      { category: "propertyType", source: source("apartment") },
      { category: "sizeOrRooms", source: source("3BHK") },
    ] }), emptyFields(), [message(text)], now);
    expect(result.factors.requirements.points).toBe(15);
  });

  it("scores tight ranges above ceilings and floors", () => {
    const points = (text: string) => buildAnalysis(analysis({ budgetSource: { type: "message", text, messageId: "message-1" } }), emptyFields(), [message(text)], now).factors.budget.points;
    expect(points("70 to 90 lakhs")).toBe(20);
    expect(points("up to 90 lakhs")).toBe(15);
    expect(points("at least 50 lakhs")).toBe(8);
    expect(points("70 to 105 lakhs")).toBe(20);
    expect(points("70 to 106 lakhs")).toBe(8);
  });

  it("uses message entry date when recalculating a saved timeline", () => {
    const text = "Within 2 months";
    const saved = message(text, "2026-09-09T12:00:00.000Z");
    const fields = emptyFields();
    fields.timeline = { value: "2 months", source: "ai", evidence: text };
    const result = buildAnalysis(analysis({ timelineSource: { type: "field", text: "2 months", messageId: null } }), fields, [saved], now);
    expect(result.factors.timeline.points).toBe(24);
  });

  it("puts exactly three months in the lower urgency level", () => {
    const text = "Within 3 months";
    const result = buildAnalysis(analysis({ timelineSource: { type: "message", text, messageId: "message-1" } }), emptyFields(), [message(text)], now);
    expect(result.factors.timeline.points).toBe(24);
  });

  it("lets code assign the level from an approximate named-holiday duration", () => {
    const text = "I plan to buy after Diwali.";
    const result = buildAnalysis(analysis({ timelineSource: { type: "message", text: "after Diwali", messageId: "message-1" }, timelineMonths: 1.4 }), emptyFields(), [message(text)], now);
    expect(result.factors.timeline.points).toBe(24);
    expect(result.factors.timeline.reason).toContain("Approximate");
  });

  it("keeps the two weighted challenge cases on opposite sides of Hot", () => {
    const source = (text: string) => ({ type: "message" as const, text, messageId: "message-1" });
    const first = "I will buy within 1 month. I need a 2BHK flat. Can I visit tomorrow?";
    const hot = buildAnalysis(analysis({
      timelineSource: source("within 1 month"),
      requirementDetails: [{ category: "propertyType", source: source("flat") }, { category: "sizeOrRooms", source: source("2BHK") }],
      buyingSignal: { level: "action", source: source("Can I visit tomorrow?"), reason: "Asked for a visit" },
    }), emptyFields(), [message(first)], now);
    expect(hot.score).toBe(75);
    expect(priorityTag(hot.score)).toBe("hot");

    const second = "I may buy in 9 months. Budget 70 to 90 lakh. Need a 2BHK flat in Vijay Nagar. I have shortlisted a few options.";
    const warm = buildAnalysis(analysis({
      timelineSource: source("in 9 months"), budgetSource: source("70 to 90 lakh"),
      requirementDetails: [
        { category: "location", source: source("Vijay Nagar") },
        { category: "propertyType", source: source("flat") },
        { category: "sizeOrRooms", source: source("2BHK") },
      ],
      buyingSignal: { level: "engaged", source: source("I have shortlisted a few options."), reason: "Shortlisted options" },
    }), emptyFields(), [message(second)], now);
    expect(warm.score).toBe(65);
    expect(priorityTag(warm.score)).toBe("warm");
  });
});

describe("suggested reply guardrail", () => {
  it("rejects unverified inventory and visit promises", () => {
    expect(hasSafeSuggestedReply(analysis({ suggestedReply: "We have apartments within your budget." }))).toBe(false);
    expect(hasSafeSuggestedReply(analysis({ suggestedReply: "Yes, we can definitely arrange a visit." }))).toBe(false);
    expect(hasSafeSuggestedReply(analysis({ suggestedReply: "I am checking our current options that fit your requirements." }))).toBe(false);
    expect(hasSafeSuggestedReply(analysis({ suggestedReply: "I can check current options and confirm a time after checking." }))).toBe(true);
  });
});
