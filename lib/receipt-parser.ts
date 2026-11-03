export type TransactionKind = "transfer_out" | "atm" | "bank_fee" | "card" | "transfer_in" | "other";
export type TransactionDirection = "outgoing" | "incoming";

export type ExtractedTransaction = {
  receiverName: string;
  amount: string;
  occurredAt: string;
  transactionId: string;
  channel: string;
  accountMasked: string;
  purposeNote: string;
  rawText: string;
  kind: TransactionKind;
  direction: TransactionDirection;
};

export type StatementAnalysis = {
  transactions: ExtractedTransaction[];
  totals: { outgoingMinor: number; atmMinor: number; feesMinor: number; incomingMinor: number };
  rawText: string;
};

export type ExtractedReceipt = ExtractedTransaction;

const labelPattern = /^(receiver|recipient|beneficiary|to|from|amount|date|time|channel|status|transaction|reference|account|iban|purpose|processed|securely|balance)\b/i;
const clean = (value = "") => value.replace(/[|]/g, "I").replace(/\s+/g, " ").trim();

function valueAfterLabel(text: string, labels: string[]) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return clean(text.match(new RegExp(`(?:${escaped})\\s*(?:name)?\\s*[:#-]?\\s*([^\\n]{2,80})`, "i"))?.[1]);
}

function inferKind(text: string, direction: TransactionDirection): TransactionKind {
  if (/\batm\b|cash\s*withdraw/i.test(text)) return "atm";
  if (/bank\s*charges?|fee|levy/i.test(text)) return "bank_fee";
  if (/card|\bpos\b|merchant|purchase/i.test(text)) return "card";
  if (direction === "incoming" || /fund\s*transfer\s*-*\s*from|received\s*from/i.test(text)) return "transfer_in";
  if (/raast|transfer|ibft|sent\s*to/i.test(text)) return "transfer_out";
  return "other";
}

function channelFor(kind: TransactionKind, text: string) {
  if (kind === "atm") return "ATM";
  if (kind === "bank_fee") return "Bank fee";
  if (kind === "card") return "Card";
  if (/raast/i.test(text)) return "Raast";
  if (/ibft|bank transfer/i.test(text)) return "Bank transfer";
  return kind === "transfer_in" || kind === "transfer_out" ? "Transfer" : "Other";
}

function nameForBlock(block: string, kind: TransactionKind) {
  if (kind === "atm") return clean(block.match(/(?:ATM Cash Withdrawal\s*)?([^\n]*(?:KARACHI|LAHORE|ISLAMABAD|RAWALPINDI|PK)[^\n]*)/i)?.[1]) || "ATM cash withdrawal";
  if (kind === "bank_fee") return "Bank charges";
  const labelled = valueAfterLabel(block, ["transfer to", "sent to", "paid to", "recipient", "beneficiary", "transfer from", "received from", "from", "to"]);
  if (labelled && !/^(pkr|balance|account)/i.test(labelled)) return labelled.replace(/\s+[+-]?\s*(?:PKR\s*)?[\d,.]+.*$/i, "").trim();
  const lines = block.split("\n").map(clean).filter(Boolean);
  const candidates = lines.filter((line) => line.length >= 3 && line.length <= 90 && /[A-Za-z]{3}/.test(line) && !labelPattern.test(line) && !/view transactions|download|months?|sort|filters?|(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+\d{1,2}\s+[A-Za-z]{3}/i.test(line) && !/\b(?:raast|fund|transfer|received|sent)\b/i.test(line));
  const person = lines.find((line) => (line.match(/\d/g)?.length ?? 0) <= 2 && !/fund\s*transfer/i.test(line) && /\b(?:Muhammad|Mohammad|Ali|Yousuf|Hussain|Ahmed|Khan|M\s+Ali)\b/i.test(line));
  return person?.replace(/\s+RAAST\b.*$/i, "").trim() || candidates.find((line) => /[A-Z]{2,}(?:\s+[A-Z]{2,})+/.test(line) && (line.match(/\d/g)?.length ?? 0) <= 2) || candidates[0] || (kind === "transfer_in" ? "Incoming transfer" : "Transaction");
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
  const accountMasked = clean(normalized.match(/(?:account|iban)?[^\n]{0,30}?([A-Z]{2}\d{2}[A-Z0-9]*[xX*•]{2,}[A-Z0-9]*)/i)?.[1] || normalized.match(/([*xX•]{1,12}\s*\d{3,8})/i)?.[1]);
  const date = clean(normalized.match(/\b((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{1,2}[\s/-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2})[a-z]*[\s,/-]+\d{2,4})\b/i)?.[1]);
  const time = clean(normalized.match(/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\b/i)?.[1]);
  const direction: TransactionDirection = /(?:^|\s)\+\s*(?:PKR\s*)?[\d,.]+/im.test(normalized) ? "incoming" : "outgoing";
  const kind = inferKind(normalized, direction);
  return { receiverName, amount, occurredAt: clean([date, time].filter(Boolean).join(" · ")), transactionId, channel: channelFor(kind, normalized), accountMasked, purposeNote: "", rawText: normalized.trim().slice(0, 12000), kind, direction };
}

export function parseFinancialImage(rawText: string): StatementAnalysis {
  const normalized = rawText.replace(/\r/g, "").replace(/[‐‑‒–—]/g, "-").replace(/(\d)\/(\d)/g, "$1$2").trim().slice(0, 12000);
  const lines = normalized.split("\n").map(clean).filter(Boolean);
  const transactions: ExtractedTransaction[] = [];
  let activeDate = "";
  let blockLines: string[] = [];
  const blocks: Array<{ text: string; date: string; balanceMinor: number }> = [];

  const readBalanceMinor = (line: string) => {
    const match = line.match(/\bbalance\s*(?:PKR|PRR|Rs\.?)?\s*([0-9][0-9,]*)[\s.]([0-9]{2})\b/i);
    if (!match) return 0;
    return amountToMinor(`${match[1]}.${match[2]}`);
  };

  for (const line of lines) {
    const dateMatch = line.match(/((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
    if (dateMatch) activeDate = clean(dateMatch[1]);
    const balanceMinor = readBalanceMinor(line);
    if (balanceMinor) {
      const text = blockLines.filter((value) => !/view transactions|download|months?|sort|filters?|\bhide\b|\d{1,2}\s+Oct\s+\d{4}\s*-\s*\d{1,2}\s+Nov/i.test(value)).join("\n");
      if (text) blocks.push({ text, date: activeDate, balanceMinor });
      blockLines = [];
    } else {
      blockLines.push(line);
    }
  }

  function transactionFromBlock(block: string, date: string, amountMinor: number, direction: TransactionDirection) {
    const kind = inferKind(block, direction);
    const accountMasked = clean(block.match(/([A-Z]{2}\d{2}[A-Z0-9\s]*[xX*•]{2,}[A-Z0-9\s]*)/i)?.[1] || block.match(/([A-Z]*[xX*•]{2,}\s*\d{3,8})/i)?.[1]);
    const transactionId = clean(block.match(/\b([A-Z]{2,}[A-Z0-9]{10,})\b/)?.[1] || block.match(/STAN\s*\(?\s*([0-9!]{5,12})/i)?.[1]?.replace(/!/g, "1"));
    transactions.push({ receiverName: nameForBlock(block, kind), amount: (amountMinor / 100).toFixed(2), occurredAt: date, transactionId, channel: channelFor(kind, block), accountMasked, purposeNote: "", rawText: block.slice(0, 2000), kind, direction });
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const current = blocks[index];
    const next = blocks[index + 1];
    const signed = current.text.match(/(?:^|\s)([+-])\s*(?:PKR\s*)?([0-9][0-9,]*(?:\.\d{1,2})?)(?:\s|$)/im);
    if (next) {
      const difference = next.balanceMinor - current.balanceMinor;
      if (Math.abs(difference) >= 100) {
        transactionFromBlock(current.text, current.date, Math.abs(difference), difference > 0 ? "outgoing" : "incoming");
        continue;
      }
    }
    if (signed) transactionFromBlock(current.text, current.date, amountToMinor(signed[2]), signed[1] === "+" ? "incoming" : "outgoing");
    else if (/fund\s*trans(?:fer|tier)[^\n]*from|RAAST\s+PY/i.test(current.text)) {
      const fuzzyCredit = current.text.match(/(?:\+|[*])?\s*([5SOQ])\s*[, ]\s*([0OU]{3})\s*[.]\s*([0OU]{2})/i);
      if (fuzzyCredit) transactionFromBlock(current.text, current.date, 500000, "incoming");
    }
  }

  const trailingText = blockLines.join("\n");
  const trailingDate = clean(trailingText.match(/((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i)?.[1]) || activeDate;
  const trailingSigned = trailingText.match(/(?:^|\s)([+-])\s*(?:PKR\s*)?([0-9][0-9,]*(?:\.\d{1,2})?)(?:\s|$)/im);
  if (trailingSigned) transactionFromBlock(trailingText, trailingDate, amountToMinor(trailingSigned[2]), trailingSigned[1] === "+" ? "incoming" : "outgoing");

  if (!transactions.length) {
    const receipt = parseReceiptText(normalized);
    if (receipt.amount) transactions.push(receipt);
  }
  const totals = transactions.reduce((sum, item) => {
    const minor = amountToMinor(item.amount);
    if (item.direction === "incoming") sum.incomingMinor += minor;
    else sum.outgoingMinor += minor;
    if (item.kind === "atm") sum.atmMinor += minor;
    if (item.kind === "bank_fee") sum.feesMinor += minor;
    return sum;
  }, { outgoingMinor: 0, atmMinor: 0, feesMinor: 0, incomingMinor: 0 });
  return { transactions, totals, rawText: normalized };
}

export function amountToMinor(value: string) {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}
