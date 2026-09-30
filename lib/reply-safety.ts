import type { RawAnalysis } from "./ai-schemas";

const unsupportedPromises = [
  /\b(?:we|i)\s+(?:have|found|selected)\s+(?:(?:some|a|the|few)\s+)?(?:(?:suitable|matching|available)\s+)?(?:options?|properties|flats?|apartments?|homes?)\b/i,
  /\b(?:we|i)\s+(?:can|will)\s+(?:(?:definitely|certainly)\s+)?(?:arrange|schedule|book|confirm)\s+(?:(?:a|the|your)\s+)?(?:visit|viewing)\b/i,
  /\b(?:visit|viewing)\s+(?:is|has been)\s+(?:arranged|confirmed|booked)\b/i,
  /\b(?:options|properties|flats|apartments|homes)\s+(?:that\s+are\s+)?(?:within|under)\s+your\s+budget\b/i,
  /\b(?:options|properties|flats|apartments|homes)\s+(?:that\s+)?(?:fit|match|meet)\s+your\s+(?:requirements|needs|budget)\b/i,
];

export function hasSafeReplyText(text: string): boolean {
  return !unsupportedPromises.some((pattern) => pattern.test(text));
}

export function hasSafeSuggestedReply(raw: RawAnalysis): boolean {
  return hasSafeReplyText(raw.suggestedReply);
}
