import { normalizeText } from "./normalize";

const hindiNumbers: Record<string, number> = {
  "शून्य": 0, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5,
  "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "बीस": 20, "तीस": 30,
  "चालीस": 40, "पचास": 50, "साठ": 60, "सत्तर": 70, "अस्सी": 80, "नब्बे": 90,
};
const englishNumbers: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function amountToken(token: string): number | null {
  const converted = token.replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)));
  if (/^\d+(?:\.\d+)?$/.test(converted)) return Number(converted);
  return hindiNumbers[token] ?? englishNumbers[token] ?? null;
}

function unitMultiplier(unit: string | undefined): number {
  if (!unit) return 1;
  const value = unit.toLowerCase();
  if (["crore", "crores", "cr", "करोड़", "करोड"].includes(value)) return 10_000_000;
  if (["lakh", "lakhs", "lac", "lacs", "l", "लाख"].includes(value)) return 100_000;
  return 1;
}

export interface ParsedMoney {
  amounts: number[];
  kind: "amount" | "range" | "ceiling" | "floor";
}

export function parseMoney(input: string): ParsedMoney | null {
  const value = input.normalize("NFKC").replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit))).replace(/(?<=\d),(?=\d)/g, "").toLowerCase();
  const englishWords = Object.keys(englishNumbers).sort((a, b) => b.length - a.length).join("|");
  const number = `(?:\\d+(?:\\.\\d+)?|शून्य|एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस|बीस|तीस|चालीस|पचास|साठ|सत्तर|अस्सी|नब्बे|${englishWords})`;
  const unit = "(?:crores?|cr|lakhs?|lacs?|lac|l|करोड़|करोड|लाख)";
  const pattern = new RegExp(`(${number})\\s*(${unit})?`, "gi");
  const allMatches = [...value.matchAll(pattern)].filter((match) => {
    const start = match.index ?? 0;
    const end = start + match[0].trimEnd().length;
    return !/[\p{L}\p{N}]/u.test(value[start - 1] || "") && !/[\p{L}\p{N}]/u.test(value[end] || "");
  });
  const unitMatches = allMatches.filter((match) => Boolean(match[2]));
  const matches = allMatches.filter((match) => {
    if (match[2]) return true;
    const start = match.index ?? 0;
    const before = value.slice(Math.max(0, start - 12), start);
    if (/(?:₹|rs\.?|rupees?|रुपये)\s*$/i.test(before)) return true;
    return unitMatches.some((other) => {
      const end = start + match[0].trimEnd().length;
      const between = other.index! > start ? value.slice(end, other.index) : value.slice(other.index! + other[0].trimEnd().length, start);
      return /^\s*(?:to|[-–—]|से)\s*$/i.test(between) || /^\s*and\s*$/i.test(between) && /between\s*$/i.test(before);
    });
  });
  if (!matches.length || matches.length > 2) return null;
  const sharedUnit = matches.find((match) => match[2])?.[2];
  const amounts = matches.map((match) => {
    const parsed = amountToken(match[1]);
    return parsed === null ? NaN : parsed * unitMultiplier(match[2] ?? sharedUnit);
  });
  if (amounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) return null;
  const normalized = normalizeText(value);
  if (amounts.length === 2) {
    if (amounts[0] > amounts[1]) return null;
    const between = value.slice((matches[0].index ?? 0) + matches[0][0].trimEnd().length, matches[1].index ?? 0);
    if (!/^\s*(?:to|[-–—]|से)\s*$/i.test(between) && !(/^\s*and\s*$/i.test(between) && /between\s*$/i.test(value.slice(0, matches[0].index)))) return null;
    return { amounts, kind: "range" };
  }
  const ceiling = /\b(up to|upto|under|below|max|maximum)\b|तक|से कम/.test(normalized);
  const floor = /\b(at least|above|over|minimum|min)\b|कम से कम|से ज्यादा/.test(normalized);
  return { amounts, kind: ceiling ? "ceiling" : floor ? "floor" : "amount" };
}

export function moneyMatches(value: string, evidence: string): boolean {
  const proposed = parseMoney(value);
  const quoted = parseMoney(evidence);
  if (!proposed || !quoted || proposed.kind !== quoted.kind || proposed.amounts.length !== quoted.amounts.length) return false;
  return proposed.amounts.every((amount, index) => Math.abs(amount - quoted.amounts[index]) < 1);
}

export function verifiedBudgetValue(value: string, evidence: string): string | null {
  const proposed = parseMoney(value);
  const quoted = parseMoney(evidence);
  if (!proposed || !quoted || proposed.amounts.length !== quoted.amounts.length) return null;
  if (!proposed.amounts.every((amount, index) => Math.abs(amount - quoted.amounts[index]) < 1)) return null;
  if (proposed.kind === quoted.kind) return value;
  if (proposed.kind === "amount" && quoted.kind === "ceiling") return `Up to ${value}`;
  if (proposed.kind === "amount" && quoted.kind === "floor") return `At least ${value}`;
  return null;
}
