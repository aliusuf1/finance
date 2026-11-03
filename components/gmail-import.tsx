"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Mail, RefreshCw, Unplug } from "lucide-react";

type Candidate = { id: string; messageId: string; receiverName: string; amountMinor: number; occurredAt: string; sourceName: string; transactionId: string };
type Status = { configured: boolean; connected: boolean; email: string | null; month: string };
type Preview = { transactions: Candidate[]; skipped: Record<string, number>; month: string; scanned: number; nextPageToken: string | null; alreadyImported: number };
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
  const [expanded, setExpanded] = useState(false);
  const locked = useRef(false);

  const loadStatus = useCallback(async () => {
    const response = await authenticatedFetch("/api/email", { cache: "no-store" });
    const data = await response.json() as Status & { error?: string };
    if (!response.ok) throw new Error(data.error || "Could not check Gmail connection.");
    setStatus(data);
  }, [authenticatedFetch]);

  useEffect(() => {
    void loadStatus().catch((cause) => setError(cause instanceof Error ? cause.message : "Gmail is unavailable."));
    const result = new URLSearchParams(window.location.search).get("gmail");
    if (result === "connected") { setExpanded(true); setMessage("Gmail connected. Fetch this month's bank alerts to review your debits."); }
    if (result === "failed") { setExpanded(true); setError("Gmail connection did not complete. Check the Google setup, then reconnect and allow read-only email access."); }
    if (result) { const url = new URL(window.location.href); url.searchParams.delete("gmail"); window.history.replaceState(null, "", url); }
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
        const skipped = { ...current.skipped };
        for (const [reason, count] of Object.entries(result.skipped)) skipped[reason] = (skipped[reason] ?? 0) + count;
        return { ...result, transactions: [...byId.values()], scanned: current.scanned + result.scanned, alreadyImported: current.alreadyImported + result.alreadyImported, skipped };
      });
      setSelected((current) => new Set([...(more ? current : []), ...result.transactions.map((row) => row.id)]));
      setExpanded(true);
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
