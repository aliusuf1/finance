export type ExtractedReceipt = {
  receiverName: string;
  amount: string;
  occurredAt: string;
  transactionId: string;
  channel: string;
  accountMasked: string;
  purposeNote: string;
  rawText: string;
};

const labelPattern = /^(receiver|recipient|beneficiary|to|from|amount|date|time|channel|status|transaction|reference|account|iban|purpose|processed|securely)\b/i;
const clean = (value = "") => value.replace(/[|]/g, "I").replace(/\s+/g, " ").trim();

function valueAfterLabel(text: string, labels: string[]) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return clean(text.match(new RegExp(`(?:${escaped})\\s*(?:name)?\\s*[:#-]?\\s*([^\\n]{2,80})`, "i"))?.[1]);
}

export function parseReceiptText(rawText: string): ExtractedReceipt {
  const normalized = rawText.replace(/\r/g, "").replace(/[‐‑‒–—]/g, "-");
  const lines = normalized.split("\n").map(clean).filter(Boolean);
  const amountMatches = [...normalized.matchAll(/(?:PKR|Rs\.?|₨)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi)];
  const fallbackAmounts = [...normalized.matchAll(/\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d{1,2})?)\b/g)];
  const amount = clean((amountMatches.at(-1) ?? fallbackAmounts.at(-1))?.[1]);
  let receiverName = valueAfterLabel(normalized, ["receiver name", "recipient", "beneficiary", "paid to", "sent to", "to"]);
  if (!receiverName || /account|iban|date|time|amount/i.test(receiverName)) receiverName = lines.find((line) => line.length >= 4 && line.length <= 55 && /[A-Za-z]{3}/.test(line) && !labelPattern.test(line) && !/successful|receipt|bank|pkr|raast/i.test(line)) ?? "";
  const transactionId = clean(normalized.match(/(?:transaction\s*(?:id|no\.?|#)|reference\s*(?:id|no\.?|#)|trx\s*id)\s*[:#-]?\s*([A-Z0-9-]{6,40})/i)?.[1]);
  const accountMasked = clean(normalized.match(/(?:account|iban)[^\n]{0,30}?([*xX•]{1,12}\s*\d{3,8})/i)?.[1]);
  const date = clean(normalized.match(/\b(\d{1,2}[\s/-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2})[a-z]*[\s,/-]+\d{2,4})\b/i)?.[1]);
  const time = clean(normalized.match(/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\b/i)?.[1]);
  const channel = /raast/i.test(normalized) ? "Raast" : /atm/i.test(normalized) ? "ATM" : /ibft|bank transfer/i.test(normalized) ? "Bank transfer" : /card|pos/i.test(normalized) ? "Card" : valueAfterLabel(normalized, ["channel", "method"]);
  return { receiverName, amount, occurredAt: clean([date, time].filter(Boolean).join(" · ")), transactionId, channel, accountMasked, purposeNote: "", rawText: normalized.trim().slice(0, 12000) };
}

export function amountToMinor(value: string) {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}
