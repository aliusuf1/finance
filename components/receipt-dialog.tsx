"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { ReceiptRow } from "./hisab-dashboard";

type Props = {
  receipt: ReceiptRow;
  mode: "edit" | "delete";
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onSaved: (receipt: ReceiptRow) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
};

export default function ReceiptDialog({ receipt, mode, authenticatedFetch, onSaved, onDeleted, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    receiverName: receipt.receiverName,
    amount: (receipt.amountMinor / 100).toFixed(2),
    direction: receipt.direction,
    kind: receipt.kind,
    occurredAt: receipt.occurredAt ?? "",
    transactionId: receipt.transactionId ?? "",
    channel: receipt.channel ?? "",
    accountMasked: receipt.accountMasked ?? "",
    purposeNote: receipt.purposeNote,
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);

  function update<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const amountMinor = Math.round(Number(draft.amount) * 100);
    if (mode === "edit" && (!draft.receiverName.trim() || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000_000)) {
      setError("Enter a receiver name and a valid amount greater than zero.");
      return;
    }
    pending.current = true;
    setBusy(true); setError("");
    try {
      const { amount: _amount, ...fields } = draft;
      const response = await authenticatedFetch("/api/receipts", {
        method: mode === "edit" ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "edit" ? { id: receipt.id, ...fields, amountMinor } : { id: receipt.id }),
      });
      const data = await response.json() as { receipt?: ReceiptRow; id?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "The receipt could not be changed. Please try again.");
      if (mode === "edit") {
        if (!data.receipt) throw new Error("The updated receipt was not returned. Refresh and try again.");
        onSaved(data.receipt);
      } else {
        if (data.id !== receipt.id) throw new Error("Deletion could not be confirmed. Refresh and try again.");
        onDeleted(receipt.id);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The receipt could not be changed. Please try again.");
    } finally {
      pending.current = false; setBusy(false);
    }
  }

  return <dialog ref={dialogRef} className="receipt-dialog import-panel" aria-labelledby="receipt-dialog-title" aria-describedby={mode === "delete" ? "receipt-delete-description" : undefined} onCancel={(event) => { event.preventDefault(); if (!pending.current) onClose(); }}>
    <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <div className="import-head"><div><h2 id="receipt-dialog-title">{mode === "edit" ? "Edit receipt" : "Delete receipt?"}</h2><p>{mode === "edit" ? "Update the saved details below." : "This receipt will be permanently removed."}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close receipt dialog"><X size={20} /></button></div>
      {mode === "delete" ? <p id="receipt-delete-description" className="receipt-delete-description">Delete <strong>{receipt.receiverName}</strong> for <strong>PKR {(receipt.amountMinor / 100).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</strong>? Your totals will update automatically. This cannot be undone.</p> : <fieldset className="receipt-edit-fields extract-grid" disabled={busy}>
        <label>Receiver / merchant<input autoFocus required maxLength={120} value={draft.receiverName} onChange={(event) => update("receiverName", event.target.value)} /></label>
        <label>Amount (PKR)<input type="number" inputMode="decimal" required min="0.01" max="1000000000" step="0.01" value={draft.amount} onChange={(event) => update("amount", event.target.value)} /></label>
        <label>Direction<select value={draft.direction} onChange={(event) => update("direction", event.target.value as ReceiptRow["direction"])}><option value="outgoing">Spent / sent</option><option value="incoming">Money received</option></select></label>
        <label>Type<select value={draft.kind} onChange={(event) => update("kind", event.target.value as ReceiptRow["kind"])}><option value="transfer_out">Transfer sent</option><option value="atm">ATM withdrawal</option><option value="bank_fee">Bank fee</option><option value="card">Card purchase</option><option value="transfer_in">Transfer received</option><option value="other">Other</option></select></label>
        <label>Date & time<input maxLength={100} value={draft.occurredAt} onChange={(event) => update("occurredAt", event.target.value)} /></label>
        <label>Channel<input maxLength={60} value={draft.channel} onChange={(event) => update("channel", event.target.value)} /></label>
        <label>Transaction ID<input maxLength={100} value={draft.transactionId} onChange={(event) => update("transactionId", event.target.value)} /></label>
        <label>Masked account<input maxLength={60} value={draft.accountMasked} onChange={(event) => update("accountMasked", event.target.value)} /></label>
        <label className="full-field">Purpose note<textarea maxLength={500} value={draft.purposeNote} onChange={(event) => update("purposeNote", event.target.value)} /></label>
      </fieldset>}
      {error && <p className="scan-error" role="alert">{error}</p>}
      <div className="import-actions"><button type="button" className="secondary-action" disabled={busy} autoFocus={mode === "delete"} onClick={onClose}>Cancel</button><button type="submit" className={mode === "delete" ? "danger-action" : "primary-action"} disabled={busy}>{busy ? (mode === "edit" ? "Saving…" : "Deleting…") : (mode === "edit" ? "Save changes" : "Delete receipt")}</button></div>
    </form>
  </dialog>;
}
