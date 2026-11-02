"use client";

import {
  ArrowLeftRight, BookOpenText, Camera, CircleDollarSign, FileImage,
  Gauge, ImagePlus, LoaderCircle, Menu, MessageSquareText, MoreHorizontal,
  ReceiptText, RefreshCw, Search, Settings, ShieldCheck, Tag, Upload, WalletCards, X,
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { amountToMinor, ExtractedReceipt, parseReceiptText } from "../lib/receipt-parser";

type ReceiptRow = {
  id: string; receiverName: string; amountMinor: number; currency: "PKR"; occurredAt: string | null;
  transactionId: string | null; channel: string | null; accountMasked: string | null;
  purposeNote: string; sourceName: string | null; createdAt: string; updatedAt: string;
};

type Props = { user: { displayName: string; email: string }; signOutPath: string };
type OcrWorkerHandle = { recognize: (image: File) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };
const emptyForm: ExtractedReceipt = { receiverName: "", amount: "", occurredAt: "", transactionId: "", channel: "", accountMasked: "", purposeNote: "", rawText: "" };
const navItems = [[Gauge, "Overview"], [ArrowLeftRight, "Receipts"], [WalletCards, "Accounts"], [CircleDollarSign, "Budgets"], [BookOpenText, "Reports"], [Tag, "Payees"]] as const;

function formatMoney(minor: number) { return `PKR ${(minor / 100).toLocaleString("en-PK", { minimumFractionDigits: minor % 100 ? 2 : 0 })}`; }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "HU"; }

export default function HisabDashboard({ user, signOutPath }: Props) {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "review" | "saving" | "error">("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [form, setForm] = useState<ExtractedReceipt>(emptyForm);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [mobileNoteOpen, setMobileNoteOpen] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const workerRef = useRef<OcrWorkerHandle | null>(null);
  const scanRunRef = useRef(0);
  const scanStateRef = useRef(scanState);
  scanStateRef.current = scanState;
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const loadReceipts = useCallback(async () => {
    setLoading(true); setPageError("");
    try {
      const response = await fetch("/api/receipts", { cache: "no-store" });
      const data = await response.json() as { receipts?: ReceiptRow[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Your receipts could not be loaded.");
      const next = data.receipts ?? []; setRows(next); setSelectedId((current) => current && next.some((row) => row.id === current) ? current : next[0]?.id ?? null);
    } catch (error) { setPageError(error instanceof Error ? error.message : "Your receipts could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadReceipts(); }, [loadReceipts]);
  useEffect(() => { setNoteDraft(selected?.purposeNote ?? ""); setNoteError(""); }, [selected?.id, selected?.purposeNote]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    if (!importOpen) return;
    const panel = dialogRef.current;
    window.setTimeout(() => panel?.querySelector<HTMLElement>("[data-autofocus],button:not([disabled]),input:not([disabled])")?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (scanStateRef.current !== "saving") { event.preventDefault(); closeImport(); } return; }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter((node) => node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [importOpen]);

  const filtered = useMemo(() => rows.filter((row) => `${row.receiverName} ${row.amountMinor} ${row.amountMinor / 100} ${formatMoney(row.amountMinor)} ${(row.amountMinor / 100).toLocaleString("en-PK")} ${row.channel ?? ""} ${row.purposeNote} ${row.transactionId ?? ""}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const totalMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  const thisMonth = rows.filter((row) => new Date(row.createdAt).getMonth() === new Date().getMonth()).length;

  function cancelScan() { scanRunRef.current += 1; const worker = workerRef.current; workerRef.current = null; if (worker) void worker.terminate().catch(() => undefined); setScanState("idle"); setScanProgress(0); }
  function openImport() { previousFocus.current = document.activeElement as HTMLElement | null; setImportOpen(true); setScanState("idle"); setScanError(""); setForm(emptyForm); setSourceName(""); setScanProgress(0); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); }
  function closeImport() { if (scanStateRef.current === "saving") return; cancelScan(); setImportOpen(false); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); window.setTimeout(() => previousFocus.current?.focus(), 0); }

  async function scanFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setScanError("Choose a PNG, JPG, HEIC, or WebP image."); setScanState("error"); return; }
    if (file.size > 10 * 1024 * 1024) { setScanError("This image is larger than 10 MB. Crop or compress it and try again."); setScanState("error"); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file)); setSourceName(file.name); setScanState("scanning"); setScanError(""); setScanProgress(2);
    const run = ++scanRunRef.current;
    let worker: OcrWorkerHandle | null = null;
    let timeoutId: ReturnType<typeof window.setTimeout> | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", undefined, { logger: (message) => { if (run === scanRunRef.current && message.status === "recognizing text") setScanProgress(Math.max(5, Math.round(message.progress * 100))); } });
      if (run !== scanRunRef.current) { await worker.terminate(); return; }
      workerRef.current = worker;
      const timeout = new Promise<never>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error("OCR took longer than 90 seconds. Try a tighter, clearer crop.")), 90_000); });
      const result = await Promise.race([worker.recognize(file), timeout]);
      if (run !== scanRunRef.current) return;
      const parsed = parseReceiptText(result.data.text);
      if (!parsed.receiverName && !parsed.amount) throw new Error("Hisab could not find a receiver name or amount in this image.");
      setForm(parsed); setScanProgress(100); setScanState("review");
    } catch (error) { if (run === scanRunRef.current) { setScanError(error instanceof Error ? error.message : "The image could not be read. Try a clearer crop."); setScanState("error"); } }
    finally { if (timeoutId) window.clearTimeout(timeoutId); if (worker) await worker.terminate().catch(() => undefined); if (workerRef.current === worker) workerRef.current = null; }
  }

  async function confirmReceipt() {
    const amountMinor = amountToMinor(form.amount);
    if (!form.receiverName.trim()) { setScanError("Enter the receiver or merchant name."); return; }
    if (!amountMinor) { setScanError("Enter a valid amount greater than zero."); return; }
    setScanState("saving"); setScanError("");
    try {
      const response = await fetch("/api/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amountMinor, currency: "PKR", sourceName }) });
      const data = await response.json() as { receipt?: ReceiptRow; error?: string };
      if (!response.ok || !data.receipt) throw new Error(data.error || "The receipt could not be saved.");
      setRows((current) => [data.receipt!, ...current]); setSelectedId(data.receipt.id); closeImport();
    } catch (error) { setScanError(error instanceof Error ? error.message : "The receipt could not be saved."); setScanState("review"); }
  }

  async function saveNote() {
    if (!selected) return;
    setSavingNote(true); setNoteError("");
    try {
      const response = await fetch("/api/receipts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, purposeNote: noteDraft }) });
      const data = await response.json() as { receipt?: ReceiptRow; error?: string };
      if (!response.ok || !data.receipt) throw new Error(data.error || "The note could not be saved.");
      setRows((current) => current.map((row) => row.id === data.receipt!.id ? data.receipt! : row)); setMobileNoteOpen(false);
    } catch (error) { setNoteError(error instanceof Error ? error.message : "The note could not be saved."); }
    finally { setSavingNote(false); }
  }

  function selectRow(row: ReceiptRow) { setSelectedId(row.id); setMobileNoteOpen(true); }
  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => { void scanFile(event.target.files?.[0]); event.target.value = ""; };

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand-row"><span className="brand-mark"><span /></span><span className="brand">Hisab</span><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
      <nav aria-label="Primary navigation">{navItems.map(([Icon, label]) => <button key={label} className={label === "Receipts" ? "nav-active" : ""} disabled={label !== "Receipts"} title={label === "Receipts" ? undefined : "Coming soon"}><Icon size={19} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-rule" /><button className="nav-secondary" disabled title="Coming soon"><Settings size={19} /><span>Settings</span></button>
      <div className="trust-note"><ShieldCheck size={23} /><strong>Your image stays on this device</strong><p>OCR runs in your browser. Hisab saves the confirmed fields and extracted OCR text to your private account.</p></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button><span className="mobile-readonly"><ShieldCheck size={14} /> Private</span><div className="welcome"><span>{user.displayName}</span><small>{user.email}</small></div><label className="global-search"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receivers, amounts, or notes" aria-label="Search receipts" /></label><button className="scan-primary" onClick={openImport}><ImagePlus size={18} /> Add receipt</button><a className="profile" href={signOutPath} title="Sign out">{initials(user.displayName)}</a></header>

      <section className="balance-strip receipt-summary"><div><p>Total value in saved receipts</p><h1>{formatMoney(totalMinor)}</h1><span className="month-change"><ReceiptText size={14} /> {thisMonth} saved this month</span></div><div className="account-splits"><div><span>Stored receipts</span><strong>{rows.length.toLocaleString("en-PK")}</strong></div><div><span>Image handling</span><strong>Never uploaded</strong></div></div><div className="connection"><ShieldCheck className="connection-icon" /><span><strong>Local OCR enabled</strong><small>Confirmed fields and OCR text are saved</small></span></div></section>

      {pageError && <div className="page-alert" role="alert"><span>{pageError}</span><button onClick={() => void loadReceipts()}><RefreshCw size={15} /> Retry</button></div>}

      <div className="workspace">
        <section className="ledger" aria-labelledby="receipts-title">
          <div className="ledger-heading"><div><h2 id="receipts-title">Your receipts</h2><p>Private records linked to your signed-in account</p></div><div className="ledger-actions"><button className="import-button" onClick={openImport}><Upload size={16} /> Upload photo</button></div></div>
          <div className="filters receipt-filters"><label className="ledger-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved receipts" /></label><button onClick={() => void loadReceipts()}><RefreshCw size={15} /> Refresh</button></div>
          <div className="table-head receipt-table-head"><span>Date</span><span>Receiver / merchant</span><span>Channel</span><span>Amount</span><span>Note</span><span /></div>
          <div className="transaction-list">
            {loading ? <div className="loading-state"><LoaderCircle className="spin" /><strong>Loading your receipts</strong><span>Records are loading from your account.</span></div> : filtered.length ? filtered.map((row) => <button key={row.id} className={`transaction-row receipt-row ${selectedId === row.id ? "selected-row" : ""}`} onClick={() => selectRow(row)}><span className="row-date"><strong>{row.occurredAt?.split("·")[0] || new Date(row.createdAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short" })}</strong><small>{row.occurredAt?.split("·")[1] || new Date(row.createdAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</small></span><span className="merchant-icon"><ReceiptText size={19} /></span><span className="merchant"><strong>{row.receiverName}</strong><small>{row.transactionId || row.sourceName || "Imported receipt"}</small></span><span className="category">{row.channel || "Receipt"}</span><strong className="amount">− {formatMoney(row.amountMinor)}</strong><span className={`row-note ${row.purposeNote ? "has-note" : ""}`}><MessageSquareText size={16} /><span>{row.purposeNote || "Add note"}</span></span><MoreHorizontal size={18} className="more" /></button>) : <div className="empty-state receipt-empty"><FileImage size={34} /><strong>{search ? "No matching receipts" : "Your receipt ledger is empty"}</strong><span>{search ? "Try a receiver name, amount, channel, or note." : "Upload a bank receipt or transaction screenshot to create your first record."}</span>{!search && <button onClick={openImport}><ImagePlus size={17} /> Add first receipt</button>}</div>}
          </div>
        </section>

        <aside className="inspector" aria-label="Selected receipt details">
          {selected ? <><div className="inspector-title"><div><span>Saved receipt</span><strong>Database record</strong></div><span className="stored-badge"><ShieldCheck size={12} /> Stored</span></div><div className="receipt"><div className="receipt-head"><span className="merchant-icon"><ReceiptText size={21} /></span><div><span>{selected.channel || "Receipt"}</span><strong>{selected.receiverName}</strong></div><ShieldCheck size={22} /></div><div className="receipt-amount"><small>Amount</small><strong>{formatMoney(selected.amountMinor)}</strong></div><dl><div><dt>Date & time</dt><dd>{selected.occurredAt || "Not detected"}</dd></div><div><dt>Transaction ID</dt><dd>{selected.transactionId || "Not detected"}</dd></div><div><dt>Account</dt><dd>{selected.accountMasked || "Not detected"}</dd></div><div><dt>Source</dt><dd>{selected.sourceName || "Image upload"}</dd></div></dl></div><div className="note-editor"><label htmlFor="purpose"><span><MessageSquareText size={17} /> Purpose note</span><small>Private to you</small></label><textarea id="purpose" value={noteDraft} onChange={(event) => { setNoteDraft(event.target.value); setNoteError(""); }} placeholder="What was this payment for?" maxLength={500} />{noteError && <div className="note-error" role="alert"><span>{noteError}</span><button onClick={() => void saveNote()}>Try saving again</button></div>}<div className="note-meta"><span>{noteDraft.length}/500</span><button onClick={() => void saveNote()} disabled={savingNote}>{savingNote ? "Saving…" : "Save note"}</button></div></div></> : <div className="inspector-empty"><ReceiptText size={38} /><strong>No receipt selected</strong><p>Upload a receipt or choose a saved record to inspect its details.</p></div>}
        </aside>
      </div>
    </main>

    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu overlay" />}
    {selected && mobileNoteOpen && <section className="mobile-note-sheet" aria-label="Add purpose note"><div><span>Selected receipt</span><button onClick={() => setMobileNoteOpen(false)} aria-label="Close purpose note"><X size={18} /></button></div><strong>{selected.receiverName}</strong><small>{formatMoney(selected.amountMinor)} · {selected.occurredAt || "Date not detected"}</small><label htmlFor="mobile-purpose">Purpose note</label><textarea id="mobile-purpose" value={noteDraft} onChange={(event) => { setNoteDraft(event.target.value); setNoteError(""); }} placeholder="What was this payment for?" maxLength={500} />{noteError && <div className="note-error" role="alert"><span>{noteError}</span><button onClick={() => void saveNote()}>Try saving again</button></div>}<button className="mobile-save" onClick={() => void saveNote()} disabled={savingNote}>{savingNote ? "Saving…" : "Save note"}</button></section>}

    {importOpen && <div className="import-overlay" role="presentation" onMouseDown={closeImport}><section ref={dialogRef} className="import-panel real-import" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}><div className="import-head"><div><h2 id="import-title">Add a receipt</h2><p>Choose a photo or screenshot. OCR happens locally, then you review the fields before anything is saved.</p></div><button data-autofocus onClick={closeImport} disabled={scanState === "saving"} aria-label={scanState === "scanning" ? "Cancel scan and close" : "Close receipt import"}><X size={20} /></button></div>
      {(scanState === "idle" || scanState === "error") && <><div className="upload-choices"><label className="upload-choice"><input type="file" accept="image/*" onChange={onFileInput} /><ImagePlus size={27} /><strong>Choose from gallery</strong><span>Photo or screenshot up to 10 MB</span></label><button className="upload-choice" onClick={() => cameraInput.current?.click()}><Camera size={27} /><strong>Take a photo</strong><span>Use your phone camera</span></button><input ref={cameraInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={onFileInput} /></div>{scanError && <div className="scan-error" role="alert"><strong>We could not read that image.</strong><span>{scanError}</span></div>}</>}
      {scanState === "scanning" && <div className="scan-stage"><div className="scan-preview">{previewUrl && <img src={previewUrl} alt="Receipt being scanned" />}<span className="scan-line" /></div><LoaderCircle className="spin" /><strong>Reading receiver and amount</strong><span>{scanProgress}% complete</span><progress value={scanProgress} max="100" /><button className="secondary-action" onClick={cancelScan}>Cancel scan</button></div>}
      {(scanState === "review" || scanState === "saving") && <div className="review-stage"><div className="extract-status"><ShieldCheck size={21} /><span><strong>Review the extracted fields</strong><small>Nothing is stored until you confirm.</small></span></div><div className="review-layout">{previewUrl && <img className="review-image" src={previewUrl} alt="Uploaded receipt preview" />}<div className="extract-grid"><label>Receiver or merchant<input value={form.receiverName} onChange={(event) => setForm({ ...form, receiverName: event.target.value })} maxLength={120} /></label><label>Amount (PKR)<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label>Date & time<input value={form.occurredAt} onChange={(event) => setForm({ ...form, occurredAt: event.target.value })} maxLength={100} /></label><label>Channel<input value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} maxLength={60} /></label><label>Transaction ID<input value={form.transactionId} onChange={(event) => setForm({ ...form, transactionId: event.target.value })} maxLength={100} /></label><label>Masked account<input value={form.accountMasked} onChange={(event) => setForm({ ...form, accountMasked: event.target.value })} maxLength={60} /></label><label className="full-field">Purpose note<input value={form.purposeNote} onChange={(event) => setForm({ ...form, purposeNote: event.target.value })} maxLength={500} placeholder="Optional" /></label></div></div>{scanError && <div className="scan-error" role="alert"><span>{scanError}</span></div>}<div className="privacy-copy"><ShieldCheck size={16} /><p><strong>Privacy:</strong> the source image is not uploaded. It stays in this browser until the dialog closes. Confirmed fields and extracted OCR text are stored in your private D1 record.</p></div><div className="import-actions"><button className="secondary-action" onClick={() => { setScanState("idle"); setScanError(""); }}>Choose another</button><button className="primary-action" onClick={() => void confirmReceipt()} disabled={scanState === "saving"}>{scanState === "saving" ? "Saving record…" : "Confirm and save"}</button></div></div>}
    </section></div>}
  </div>;
}
