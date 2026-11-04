"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, LoaderCircle, Mail, RefreshCw, Unplug } from "lucide-react";

type Candidate = { id: string; messageId: string; receiverName: string; amountMinor: number; occurredAt: string; sourceName: string; transactionId: string };
type UnclearCandidate = { messageId: string; receiverName: string; occurredAt: string; sourceName: string; subject: string; amountOptions: number[]; excerpt: string; transactionId: string; channel: string; accountMasked: string };
type Status = { configured: boolean; connected: boolean; email: string | null; month: string };
type Preview = { transactions: Candidate[]; unclear: UnclearCandidate[]; skipped: Record<string, number>; month: string; scanned: number; nextPageToken: string | null; alreadyImported: number };
type UnclearDraft = { receiverName: string; amount: string };
type Props = {
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onImported: () => Promise<void>;
};

const skipLabels: Record<string, string> = {
  sender: "other senders", not_debit: "credits or non-debit alerts", date_unclear: "unclear transaction dates",
  outside_month: "outside this month", amount_unclear: "unclear amounts", duplicate: "duplicate alerts",
};

export default function GmailImport({ authenticatedFetch, onImported }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unclearDrafts, setUnclearDrafts] = useState<Record<string, UnclearDraft>>({});
  const [expanded, setExpanded] = useState(false);
  const locked = useRef(false);

  const loadStatus = useCallback(async () => {
    const response = await authenticatedFetch("/api/email", { cache: "no-store" });
    const data = await response.json() as Status & { error?: string };
    if (!response.ok) throw new Error(data.error || "Could not check Gmail connection.");
    setStatus(data);
  }, [authenticatedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatus().catch((cause) => setError(cause instanceof Error ? cause.message : "Gmail is unavailable."));
      const result = new URLSearchParams(window.location.search).get("gmail");
      if (result === "connected") { setExpanded(true); setMessage("Gmail connected. Fetch this month's bank alerts to review your debits."); }
      if (result === "failed") { setExpanded(true); setError("Gmail connection did not complete. Check the Google setup, then reconnect and allow read-only email access."); }
      if (result) { const url = new URL(window.location.href); url.searchParams.delete("gmail"); window.history.replaceState(null, "", url); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  async function post<T>(body: unknown): Promise<T> {
    const response = await authenticatedFetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as T & { error?: string; reconnect?: boolean };
    if (!response.ok) {
      if (data.reconnect) { setStatus((current) => current ? { ...current, connected: false } : current); setPreview(null); setSelected(new Set()); }
      throw new Error(data.error || "Gmail could not finish this request.");
    }
    return data;
  }

  async function run(label: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(label); setError(""); setMessage("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Gmail could not finish this request."); }
    finally { locked.current = false; setBusy(""); }
  }

  async function fetchAlerts(more = false) {
    await run("Fetching bank alerts…", async () => {
      const result = await post<Preview>({ action: "preview", ...(more && preview?.nextPageToken ? { pageToken: preview.nextPageToken, month: preview.month } : {}) });
      setPreview((current) => {
        if (!more || !current || current.month !== result.month) return result;
        const byId = new Map(current.transactions.map((row) => [row.id, row]));
        for (const row of result.transactions) byId.set(row.id, row);
        const unclearById = new Map(current.unclear.map((row) => [row.messageId, row]));
        for (const row of result.unclear) unclearById.set(row.messageId, row);
        const skipped = { ...current.skipped };
        for (const [reason, count] of Object.entries(result.skipped)) skipped[reason] = (skipped[reason] ?? 0) + count;
        return { ...result, transactions: [...byId.values()], unclear: [...unclearById.values()], scanned: current.scanned + result.scanned, alreadyImported: current.alreadyImported + result.alreadyImported, skipped };
      });
      setUnclearDrafts((current) => {
        const next = more ? { ...current } : {};
        for (const row of result.unclear) next[row.messageId] ??= { receiverName: row.receiverName, amount: row.amountOptions.length === 1 ? (row.amountOptions[0] / 100).toFixed(2) : "" };
        return next;
      });
      setSelected((current) => new Set([...(more ? current : []), ...result.transactions.map((row) => row.id)]));
      setExpanded(true);
    });
  }

  function amountMinor(value: string) {
    const normalized = value.trim().replaceAll(",", "");
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) return null;
    const minor = Math.round(Number(normalized) * 100);
    return Number.isSafeInteger(minor) && minor > 0 && minor <= 100_000_000_000 ? minor : null;
  }

  async function importUnclear(row: UnclearCandidate) {
    if (!preview) return;
    const draft = unclearDrafts[row.messageId];
    const receiverName = draft?.receiverName.trim() ?? "";
    const correctedAmount = amountMinor(draft?.amount ?? "");
    if (!receiverName) { setError("Enter the receiver or merchant name before saving this alert."); return; }
    if (correctedAmount === null) { setError("Enter a valid PKR amount greater than zero, with up to two decimal places."); return; }
    await run("Saving corrected transaction…", async () => {
      const result = await post<{ imported: number; alreadyImported: number }>({ action: "import_unclear", messageId: row.messageId, month: preview.month, receiverName, amountMinor: correctedAmount });
      setPreview((current) => current ? {
        ...current,
        unclear: current.unclear.filter((item) => item.messageId !== row.messageId),
        skipped: { ...current.skipped, amount_unclear: Math.max(0, (current.skipped.amount_unclear ?? 1) - 1) },
        alreadyImported: current.alreadyImported + result.alreadyImported,
      } : current);
      setUnclearDrafts((current) => { const next = { ...current }; delete next[row.messageId]; return next; });
      setMessage(result.imported ? "Corrected transaction saved." : "This transaction was already imported.");
      if (result.imported) await onImported();
    });
  }

  async function importSelected() {
    if (!preview || !selected.size) return;
    await run("Importing selected debits…", async () => {
      const rows = preview.transactions.filter((row) => selected.has(row.id));
      let imported = 0;
      let processed = 0;
      try {
        for (let offset = 0; offset < rows.length; offset += 50) {
          const batch = rows.slice(offset, offset + 50);
          const result = await post<{ imported: number }>({ action: "import", messageIds: batch.map((row) => row.messageId), month: preview.month });
          imported += result.imported;
          processed += batch.length;
          const batchIds = new Set(batch.map((row) => row.id));
          setPreview((current) => current ? { ...current, transactions: current.transactions.filter((row) => !batchIds.has(row.id)) } : current);
          setSelected((current) => new Set([...current].filter((id) => !batchIds.has(id))));
          setMessage(`${imported} debit transaction${imported === 1 ? "" : "s"} imported.`);
        }
      } catch (cause) {
        throw new Error(`${imported} imported before this request stopped. ${cause instanceof Error ? cause.message : "Please retry."}`);
      } finally { if (processed) await onImported(); }
    });
  }

  const monthLabel = status?.month ? new Date(`${status.month}-15T12:00:00+05:00`).toLocaleDateString("en-PK", { month: "long", year: "numeric", timeZone: "Asia/Karachi" }) : "Current month";

  return <section className="gmail-import" aria-label="Bank email import">
    <div className="gmail-heading">
      <Mail size={22} aria-hidden="true" />
      <div><h2>Bank alerts from Gmail</h2><p>{monthLabel} · Meezan + HBL · Debit transactions only</p></div>
      <button className="gmail-details-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span>{expanded ? "Hide" : "Details"}</span><ChevronDown size={16} /></button>
      {status?.connected ? <button className="gmail-primary" disabled={!!busy} onClick={() => void fetchAlerts()}><RefreshCw size={15} /> Fetch this month</button> : <button className="gmail-primary" disabled={!!busy || !status} onClick={() => {
        if (!status?.configured) { setExpanded(true); return; }
        void run("Opening Google…", async () => { const data = await post<{ url: string }>({ action: "connect" }); window.location.assign(data.url); });
      }}>{status?.configured === false ? "Set up Gmail" : "Connect Gmail"}</button>}
    </div>
    {expanded && <div className="gmail-details">
      <p>Only <strong>no-reply@meezanbank.com</strong> and <strong>digital.banking@hbl.com</strong>. Both the email and transaction must be from the current month in Pakistan time. Credits, refunds, reversals and unclear alerts are skipped.</p>
      <p>Google grants read-only mailbox access. Hisab requests only matching bank alerts, never sends or deletes email, and saves only the transaction fields you import. The Gmail connection is encrypted in this browser and tied to your Hisab login.</p>
      {status?.configured === false && <div className="gmail-setup"><strong>Google connection setup required</strong><p>The project owner needs to configure a Google OAuth web client first. Follow <code>GMAIL_SETUP.md</code> in the project, then restart the server.</p><button disabled={!!busy} onClick={() => void run("Checking setup…", loadStatus)}>Check setup again</button></div>}
      {status?.connected && <div className="gmail-connected"><span>Connected: {status.email}</span><button disabled={!!busy} onClick={() => void run("Disconnecting…", async () => { await post({ action: "disconnect" }); setPreview(null); setSelected(new Set()); await loadStatus(); setMessage("Gmail disconnected. Previously imported receipts are kept."); })}><Unplug size={14} /> Disconnect</button></div>}
    </div>}
    {busy && <p className="gmail-feedback" role="status"><LoaderCircle size={16} className="spin" /> {busy}</p>}
    {error && <p className="gmail-error" role="alert">{error}</p>}
    {message && <p className="gmail-feedback" role="status">{message}</p>}
    {expanded && preview && <div className="gmail-preview">
      <div className="gmail-preview-summary"><strong>{preview.transactions.length} new debit{preview.transactions.length === 1 ? "" : "s"} ready to review</strong><span>{preview.scanned} alerts checked · {preview.alreadyImported} already imported</span></div>
      {!!Object.keys(preview.skipped).length && <p className="gmail-skipped">Skipped: {Object.entries(preview.skipped).filter(([, count]) => count > 0).map(([reason, count]) => `${count} ${skipLabels[reason] ?? reason}`).join(" · ")}. Unclear alerts are left out rather than guessed.</p>}
      {!!preview.unclear.length && <section className="gmail-unclear" aria-labelledby="gmail-unclear-title">
        <div className="gmail-unclear-heading"><AlertTriangle size={18} aria-hidden="true" /><div><h3 id="gmail-unclear-title">Review unclear alerts</h3><p>Hisab found more than one possible amount. Check each bank alert and save every transaction separately.</p></div><span>{preview.unclear.length}</span></div>
        <div className="gmail-unclear-list">{preview.unclear.map((row) => {
          const draft = unclearDrafts[row.messageId] ?? { receiverName: row.receiverName, amount: "" };
          const receiverId = `unclear-receiver-${row.messageId}`;
          const amountId = `unclear-amount-${row.messageId}`;
          return <article className="gmail-unclear-card" key={row.messageId}>
            <div className="gmail-unclear-meta"><div><strong>{row.receiverName}</strong><span>{row.sourceName} · {row.occurredAt}</span></div><small>{row.subject}</small></div>
            <details><summary>View bank alert details</summary><pre>{row.excerpt}</pre></details>
            {!!row.amountOptions.length && <div className="gmail-amount-options"><span>Possible amounts</span><div>{row.amountOptions.map((option) => <button type="button" disabled={!!busy} key={option} onClick={() => setUnclearDrafts((current) => ({ ...current, [row.messageId]: { ...draft, amount: (option / 100).toFixed(2) } }))}>PKR {(option / 100).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</button>)}</div></div>}
            <div className="gmail-unclear-form">
              <label htmlFor={receiverId}><span>Receiver or merchant</span><input id={receiverId} disabled={!!busy} maxLength={120} value={draft.receiverName} onChange={(event) => setUnclearDrafts((current) => ({ ...current, [row.messageId]: { ...draft, receiverName: event.target.value } }))} /></label>
              <label htmlFor={amountId}><span>Amount (PKR)</span><input id={amountId} disabled={!!busy} inputMode="decimal" maxLength={16} placeholder="0.00" value={draft.amount} onChange={(event) => setUnclearDrafts((current) => ({ ...current, [row.messageId]: { ...draft, amount: event.target.value } }))} /></label>
              <button className="gmail-primary" disabled={!!busy} onClick={() => void importUnclear(row)}>Save transaction</button>
            </div>
            <p className="gmail-review-note">The original Gmail message is checked again before saving.</p>
          </article>;
        })}</div>
      </section>}
      {!!preview.transactions.length && <>
        <label className="gmail-select-all"><input type="checkbox" disabled={!!busy} checked={selected.size === preview.transactions.length} onChange={(event) => setSelected(event.target.checked ? new Set(preview.transactions.map((row) => row.id)) : new Set())} /> Select all debits</label>
        <div className="gmail-candidates">{preview.transactions.map((row) => <label key={row.id} className="gmail-candidate"><input type="checkbox" disabled={!!busy} checked={selected.has(row.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /><span><strong>{row.receiverName}</strong><small>{row.sourceName} · {row.occurredAt}</small></span><strong>PKR {(row.amountMinor / 100).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</strong></label>)}</div>
      </>}
      <div className="gmail-preview-actions">{preview.nextPageToken && <button disabled={!!busy} onClick={() => void fetchAlerts(true)}>Load more alerts from this month</button>}<button className="gmail-primary" disabled={!!busy || !selected.size} onClick={() => void importSelected()}>Import {selected.size} debit{selected.size === 1 ? "" : "s"}</button></div>
      {preview.nextPageToken && <p className="gmail-skipped">More alerts remain. Load them to check the rest of this month.</p>}
      <p className="gmail-skipped">Already imported alerts are skipped, preserving your edits and notes. If you delete an imported receipt, fetching again makes it available to re-import.</p>
    </div>}
  </section>;
}
