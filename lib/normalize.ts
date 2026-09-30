export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasEvidence(message: string, quote: string): boolean {
  const normalizedQuote = normalizeText(quote);
  return normalizedQuote.length > 0 && normalizeText(message).includes(normalizedQuote);
}

export function duplicateKey(values: Record<string, { value: string }>): string | null {
  const name = normalizeText(values.name?.value ?? "");
  const other = ["location", "requirement", "budget", "timeline"].map((key) => {
    let value = normalizeText(values[key]?.value ?? "");
    if (key === "budget") value = value.replace(/\b(lakhs?|lacs?|lac)\b/g, "lakh").replace(/\b(crores?|cr)\b/g, "crore").replace(/(?<=\d)l\b/g, " lakh");
    return value;
  });
  if (!name || other.every((part) => !part)) return null;
  return [name, ...other].join("|");
}
