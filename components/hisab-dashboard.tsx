"use client";

import { RedirectToSignIn, UserButton, useAuth, useUser } from "@clerk/react";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, BookOpenText, Camera, CircleDollarSign, FileImage,
  Gauge, ImagePlus, LoaderCircle, Menu, MessageSquareText, MoreHorizontal,
  ReceiptText, RefreshCw, Search, Settings, ShieldCheck, Tag, Upload, WalletCards, X,
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { amountToMinor, ExtractedTransaction, parseFinancialImage, StatementAnalysis } from "../lib/receipt-parser";

type ReceiptRow = {
  id: string; receiverName: string; amountMinor: number; currency: "PKR"; occurredAt: string | null;
  transactionId: string | null; channel: string | null; accountMasked: string | null;
  purposeNote: string; sourceName: string | null; createdAt: string; updatedAt: string;
  direction: "outgoing" | "incoming"; kind: "transfer_out" | "atm" | "bank_fee" | "card" | "transfer_in" | "other";
};

type OcrWorkerHandle = {
  recognize: (image: File | HTMLCanvasElement) => Promise<{ data: { text: string } }>;
  setParameters: (parameters: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};
const emptyForm: ExtractedTransaction = { receiverName: "", amount: "", occurredAt: "", transactionId: "", channel: "", accountMasked: "", purposeNote: "", rawText: "", direction: "outgoing", kind: "other" };
const emptyTotals: StatementAnalysis["totals"] = { outgoingMinor: 0, atmMinor: 0, feesMinor: 0, incomingMinor: 0 };
const navItems = [[Gauge, "Overview"], [ArrowLeftRight, "Receipts"], [WalletCards, "Accounts"], [CircleDollarSign, "Budgets"], [BookOpenText, "Reports"], [Tag, "Payees"]] as const;

function formatMoney(minor: number) { return `PKR ${(minor / 100).toLocaleString("en-PK", { minimumFractionDigits: minor % 100 ? 2 : 0 })}`; }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "HU"; }

async function enhancePhoneStatement(file: File, emphasizeGreen = false) {
  const bitmap = await createImageBitmap(file);
  const sourceX = Math.round(bitmap.width * .125);
  const sourceY = Math.round(bitmap.height * .043);
  const sourceWidth = Math.round(bitmap.width * .708);
  const sourceHeight = Math.round(bitmap.height * .813);
  const targetWidth = Math.min(1800, Math.max(1200, sourceWidth * 3));
  const scale = targetWidth / sourceWidth;
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) { bitmap.close(); throw new Error("This browser could not prepare the statement image."); }
  context.filter = emphasizeGreen ? "none" : "grayscale(1)";
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixels.length; index += 4) histogram[pixels[index]] += 1;
  const pixelCount = pixels.length / 4;
  const lowerTarget = pixelCount * .01;
  const upperTarget = pixelCount * .99;
  let cumulative = 0, low = 0, high = 255;
  for (let value = 0; value < 256; value += 1) { cumulative += histogram[value]; if (cumulative >= lowerTarget) { low = value; break; } }
  cumulative = 0;
  for (let value = 0; value < 256; value += 1) { cumulative += histogram[value]; if (cumulative >= upperTarget) { high = value; break; } }
  const range = Math.max(1, high - low);
  for (let index = 0; index < pixels.length; index += 4) {
    const value = Math.max(0, Math.min(255, Math.round((pixels[index] - low) * 255 / range)));
    pixels[index] = value; pixels[index + 1] = value; pixels[index + 2] = value;
  }
  const normalized = new Uint8ClampedArray(pixels);
  const row = canvas.width * 4;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const index = y * row + x * 4;
      const value = Math.max(0, Math.min(255, 5 * normalized[index] - normalized[index - 4] - normalized[index + 4] - normalized[index - row] - normalized[index + row]));
      pixels[index] = value; pixels[index + 1] = value; pixels[index + 2] = value;
    }
  }
  context.putImageData(frame, 0, 0);
  return canvas;
}

export default function HisabDashboard() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user: clerkUser } = useUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress || "Signed-in user";
  const displayName = clerkUser?.fullName || clerkUser?.firstName || email.split("@")[0];
  const user = { displayName, email };
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
  const [batch, setBatch] = useState<ExtractedTransaction[]>([emptyForm]);
  const [analysisTotals, setAnalysisTotals] = useState(emptyTotals);
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

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const token = await getToken();
    return fetch(input, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token || ""}` } });
  }, [getToken]);

  const loadReceipts = useCallback(async () => {
    setLoading(true); setPageError("");
    try {
      const response = await authenticatedFetch("/api/receipts", { cache: "no-store" });
      const data = await response.json() as { receipts?: ReceiptRow[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Your receipts could not be loaded.");
      const next = data.receipts ?? []; setRows(next); setSelectedId((current) => current && next.some((row) => row.id === current) ? current : next[0]?.id ?? null);
    } catch (error) { setPageError(error instanceof Error ? error.message : "Your receipts could not be loaded."); }
    finally { setLoading(false); }
  }, [authenticatedFetch]);

  useEffect(() => { void loadReceipts(); }, [loadReceipts]);
  useEffect(() => { setNoteDraft(selected?.purposeNote ?? ""); setNoteError(""); }, [selected?.id, selected?.purposeNote]);
  useEffect(() => {
    setAnalysisTotals(batch.reduce((sum, item) => {
      const minor = amountToMinor(item.amount);
      if (item.direction === "incoming") sum.incomingMinor += minor; else sum.outgoingMinor += minor;
      if (item.kind === "atm") sum.atmMinor += minor;
      if (item.kind === "bank_fee") sum.feesMinor += minor;
      return sum;
    }, { ...emptyTotals }));
  }, [batch]);
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
  const totalMinor = rows.filter((row) => row.direction === "outgoing").reduce((sum, row) => sum + row.amountMinor, 0);
  const atmMinor = rows.filter((row) => row.kind === "atm").reduce((sum, row) => sum + row.amountMinor, 0);
  const incomingMinor = rows.filter((row) => row.direction === "incoming").reduce((sum, row) => sum + row.amountMinor, 0);
  const thisMonth = rows.filter((row) => new Date(row.createdAt).getMonth() === new Date().getMonth()).length;

  function cancelScan() { scanRunRef.current += 1; const worker = workerRef.current; workerRef.current = null; if (worker) void worker.terminate().catch(() => undefined); setScanState("idle"); setScanProgress(0); }
  function openImport() { previousFocus.current = document.activeElement as HTMLElement | null; setImportOpen(true); setScanState("idle"); setScanError(""); setBatch([emptyForm]); setAnalysisTotals(emptyTotals); setSourceName(""); setScanProgress(0); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); }
  function closeImport(force = false) { if (scanStateRef.current === "saving" && !force) return; cancelScan(); setImportOpen(false); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); window.setTimeout(() => previousFocus.current?.focus(), 0); }

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
      let ocrPass = 0;
      worker = await createWorker("eng", undefined, { logger: (message) => { if (run === scanRunRef.current && message.status === "recognizing text") setScanProgress(Math.min(99, Math.max(5, Math.round((ocrPass / 3 + message.progress / 3) * 100)))); } });
      if (run !== scanRunRef.current) { await worker.terminate(); return; }
      workerRef.current = worker;
      const timeout = new Promise<never>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error("OCR took longer than 90 seconds. Try a tighter, clearer crop.")), 90_000); });
      const analyze = async () => {
        const original = await worker!.recognize(file);
        let best = parseFinancialImage(original.data.text);
        if (best.transactions.length < 2) {
          ocrPass = 1;
          const enhanced = await enhancePhoneStatement(file);
          await worker!.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
          const second = await worker!.recognize(enhanced);
          const enhancedResult = parseFinancialImage(second.data.text);
          if (enhancedResult.transactions.length > best.transactions.length) best = enhancedResult;
          if (!best.transactions.some((item) => item.direction === "incoming")) {
            ocrPass = 2;
            const greenEnhanced = await enhancePhoneStatement(file, true);
            await worker!.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
            const greenScan = await worker!.recognize(greenEnhanced);
            const greenResult = parseFinancialImage(greenScan.data.text);
            if (greenResult.transactions.length > best.transactions.length) best = greenResult;
            const newCredits = greenResult.transactions.filter((item) => item.direction === "incoming" && !best.transactions.some((existing) => existing.direction === "incoming" && amountToMinor(existing.amount) === amountToMinor(item.amount)));
            if (newCredits.length) {
              const transactions = [...best.transactions, ...newCredits];
              best = { ...best, transactions, totals: transactions.reduce((sum, item) => {
                const minor = amountToMinor(item.amount);
                if (item.direction === "incoming") sum.incomingMinor += minor; else sum.outgoingMinor += minor;
                if (item.kind === "atm") sum.atmMinor += minor;
                if (item.kind === "bank_fee") sum.feesMinor += minor;
                return sum;
              }, { ...emptyTotals }) };
            }
          }
        }
        return best;
      };
      const parsed = await Promise.race([analyze(), timeout]);
      if (run !== scanRunRef.current) return;
      if (!parsed.transactions.length || !parsed.transactions.some((item) => item.amount)) throw new Error("Hisab could not find a transaction amount in this image.");
      setBatch(parsed.transactions); setAnalysisTotals(parsed.totals); setScanProgress(100); setScanState("review");
    } catch (error) { if (run === scanRunRef.current) { setScanError(error instanceof Error ? error.message : "The image could not be read. Try a clearer crop."); setScanState("error"); } }
    finally { if (timeoutId) window.clearTimeout(timeoutId); if (worker) await worker.terminate().catch(() => undefined); if (workerRef.current === worker) workerRef.current = null; }
  }

  async function confirmReceipt() {
    if (batch.some((item) => !item.receiverName.trim())) { setScanError("Every transaction needs a receiver, merchant, or ATM name."); return; }
    if (batch.some((item) => !amountToMinor(item.amount))) { setScanError("Every transaction needs a valid amount greater than zero."); return; }
    setScanState("saving"); setScanError("");
    try {
      const transactions = batch.map((item) => ({ ...item, amountMinor: amountToMinor(item.amount), currency: "PKR", sourceName }));
      const response = await authenticatedFetch("/api/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactions }) });
      const data = await response.json() as { receipts?: ReceiptRow[]; error?: string };
      if (!response.ok || !data.receipts?.length) throw new Error(data.error || "The transactions could not be saved.");
      setRows((current) => [...data.receipts!, ...current]); setSelectedId(data.receipts[0].id); closeImport(true);
    } catch (error) { setScanError(error instanceof Error ? error.message : "The receipt could not be saved."); setScanState("review"); }
  }

  function updateBatch(index: number, values: Partial<ExtractedTransaction>) {
    setBatch((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  }

  async function saveNote() {
    if (!selected) return;
    setSavingNote(true); setNoteError("");
    try {
      const response = await authenticatedFetch("/api/receipts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, purposeNote: noteDraft }) });
      const data = await response.json() as { receipt?: ReceiptRow; error?: string };
      if (!response.ok || !data.receipt) throw new Error(data.error || "The note could not be saved.");
      setRows((current) => current.map((row) => row.id === data.receipt!.id ? data.receipt! : row)); setMobileNoteOpen(false);
    } catch (error) { setNoteError(error instanceof Error ? error.message : "The note could not be saved."); }
    finally { setSavingNote(false); }
  }

  function selectRow(row: ReceiptRow) { setSelectedId(row.id); setMobileNoteOpen(true); }
  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => { void scanFile(event.target.files?.[0]); event.target.value = ""; };

  if (!isLoaded) return <main className="auth-shell"><LoaderCircle className="spin" aria-label="Loading sign-in" /></main>;
  if (!isSignedIn) return <RedirectToSignIn />;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand-row"><span className="brand-mark"><span /></span><span className="brand">Hisab</span><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
      <nav aria-label="Primary navigation">{navItems.map(([Icon, label]) => <button key={label} className={label === "Receipts" ? "nav-active" : ""} disabled={label !== "Receipts"} title={label === "Receipts" ? undefined : "Coming soon"}><Icon size={19} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-rule" /><button className="nav-secondary" disabled title="Coming soon"><Settings size={19} /><span>Settings</span></button>
      <div className="trust-note"><ShieldCheck size={23} /><strong>Your image stays on this device</strong><p>OCR runs in your browser. Hisab saves the confirmed fields and extracted OCR text to your private account.</p></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button><span className="mobile-readonly"><ShieldCheck size={14} /> Private</span><div className="welcome"><span>{user.displayName}</span><small>{user.email}</small></div><label className="global-search"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receivers, amounts, or notes" aria-label="Search transactions" /></label><button className="scan-primary" onClick={openImport}><ImagePlus size={18} /> Analyze image</button><div className="profile" title={`Account: ${user.displayName}`}><UserButton /></div></header>

      <section className="balance-strip receipt-summary"><div><p>Total spent and withdrawn</p><h1>{formatMoney(totalMinor)}</h1><span className="month-change"><ReceiptText size={14} /> {thisMonth} saved this month</span></div><div className="account-splits statement-splits"><div><span><Banknote size={14} /> ATM cash</span><strong>{formatMoney(atmMinor)}</strong></div><div><span><ArrowDownLeft size={14} /> Money received</span><strong>{formatMoney(incomingMinor)}</strong></div></div><div className="connection"><ShieldCheck className="connection-icon" /><span><strong>Supabase + Clerk</strong><small>Private records scoped to your login</small></span></div></section>

      {pageError && <div className="page-alert" role="alert"><span>{pageError}</span><button onClick={() => void loadReceipts()}><RefreshCw size={15} /> Retry</button></div>}

      <div className="workspace">
        <section className="ledger" aria-labelledby="receipts-title">
          <div className="ledger-heading"><div><h2 id="receipts-title">Your transactions</h2><p>Receipts and statement screenshots, separated by money direction</p></div><div className="ledger-actions"><button className="import-button" onClick={openImport}><Upload size={16} /> Upload screenshot</button></div></div>
          <div className="filters receipt-filters"><label className="ledger-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved receipts" /></label><button onClick={() => void loadReceipts()}><RefreshCw size={15} /> Refresh</button></div>
          <div className="table-head receipt-table-head"><span>Date</span><span>Receiver / merchant</span><span>Channel</span><span>Amount</span><span>Note</span><span /></div>
          <div className="transaction-list">
            {loading ? <div className="loading-state"><LoaderCircle className="spin" /><strong>Loading your transactions</strong><span>Records are loading from Supabase.</span></div> : filtered.length ? filtered.map((row) => <button key={row.id} className={`transaction-row receipt-row ${selectedId === row.id ? "selected-row" : ""}`} onClick={() => selectRow(row)}><span className="row-date"><strong>{row.occurredAt?.split("·")[0] || new Date(row.createdAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short" })}</strong><small>{row.kind.replaceAll("_", " ")}</small></span><span className={`merchant-icon ${row.direction === "incoming" ? "incoming-icon" : ""}`}>{row.direction === "incoming" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</span><span className="merchant"><strong>{row.receiverName}</strong><small>{row.transactionId || row.sourceName || "Imported image"}</small></span><span className="category">{row.channel || "Transaction"}</span><strong className={`amount ${row.direction === "incoming" ? "incoming-amount" : ""}`}>{row.direction === "incoming" ? "+" : "−"} {formatMoney(row.amountMinor)}</strong><span className={`row-note ${row.purposeNote ? "has-note" : ""}`}><MessageSquareText size={16} /><span>{row.purposeNote || "Add note"}</span></span><MoreHorizontal size={18} className="more" /></button>) : <div className="empty-state receipt-empty"><FileImage size={34} /><strong>{search ? "No matching transactions" : "Your transaction ledger is empty"}</strong><span>{search ? "Try a receiver name, amount, channel, or note." : "Upload a receipt or bank-statement screenshot to calculate spending and ATM withdrawals."}</span>{!search && <button onClick={openImport}><ImagePlus size={17} /> Analyze first image</button>}</div>}
          </div>
        </section>

        <aside className="inspector" aria-label="Selected receipt details">
          {selected ? <><div className="inspector-title"><div><span>Saved receipt</span><strong>Database record</strong></div><span className="stored-badge"><ShieldCheck size={12} /> Stored</span></div><div className="receipt"><div className="receipt-head"><span className="merchant-icon"><ReceiptText size={21} /></span><div><span>{selected.channel || "Receipt"}</span><strong>{selected.receiverName}</strong></div><ShieldCheck size={22} /></div><div className="receipt-amount"><small>Amount</small><strong>{formatMoney(selected.amountMinor)}</strong></div><dl><div><dt>Date & time</dt><dd>{selected.occurredAt || "Not detected"}</dd></div><div><dt>Transaction ID</dt><dd>{selected.transactionId || "Not detected"}</dd></div><div><dt>Account</dt><dd>{selected.accountMasked || "Not detected"}</dd></div><div><dt>Source</dt><dd>{selected.sourceName || "Image upload"}</dd></div></dl></div><div className="note-editor"><label htmlFor="purpose"><span><MessageSquareText size={17} /> Purpose note</span><small>Private to you</small></label><textarea id="purpose" value={noteDraft} onChange={(event) => { setNoteDraft(event.target.value); setNoteError(""); }} placeholder="What was this payment for?" maxLength={500} />{noteError && <div className="note-error" role="alert"><span>{noteError}</span><button onClick={() => void saveNote()}>Try saving again</button></div>}<div className="note-meta"><span>{noteDraft.length}/500</span><button onClick={() => void saveNote()} disabled={savingNote}>{savingNote ? "Saving…" : "Save note"}</button></div></div></> : <div className="inspector-empty"><ReceiptText size={38} /><strong>No receipt selected</strong><p>Upload a receipt or choose a saved record to inspect its details.</p></div>}
        </aside>
      </div>
    </main>

    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu overlay" />}
    {selected && mobileNoteOpen && <section className="mobile-note-sheet" aria-label="Add purpose note"><div><span>Selected receipt</span><button onClick={() => setMobileNoteOpen(false)} aria-label="Close purpose note"><X size={18} /></button></div><strong>{selected.receiverName}</strong><small>{formatMoney(selected.amountMinor)} · {selected.occurredAt || "Date not detected"}</small><label htmlFor="mobile-purpose">Purpose note</label><textarea id="mobile-purpose" value={noteDraft} onChange={(event) => { setNoteDraft(event.target.value); setNoteError(""); }} placeholder="What was this payment for?" maxLength={500} />{noteError && <div className="note-error" role="alert"><span>{noteError}</span><button onClick={() => void saveNote()}>Try saving again</button></div>}<button className="mobile-save" onClick={() => void saveNote()} disabled={savingNote}>{savingNote ? "Saving…" : "Save note"}</button></section>}

    {importOpen && <div className="import-overlay" role="presentation" onMouseDown={closeImport}><section ref={dialogRef} className="import-panel real-import statement-import" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}><div className="import-head"><div><h2 id="import-title">Analyze a financial image</h2><p>Upload one receipt or a statement screenshot with several transactions. Hisab separates spending, ATM cash, fees, and incoming money.</p></div><button data-autofocus onClick={closeImport} disabled={scanState === "saving"} aria-label={scanState === "scanning" ? "Cancel scan and close" : "Close image analysis"}><X size={20} /></button></div>
      {(scanState === "idle" || scanState === "error") && <><div className="upload-choices"><label className="upload-choice"><input type="file" accept="image/*" onChange={onFileInput} /><ImagePlus size={27} /><strong>Choose from gallery</strong><span>Photo or screenshot up to 10 MB</span></label><button className="upload-choice" onClick={() => cameraInput.current?.click()}><Camera size={27} /><strong>Take a photo</strong><span>Use your phone camera</span></button><input ref={cameraInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={onFileInput} /></div>{scanError && <div className="scan-error" role="alert"><strong>We could not read that image.</strong><span>{scanError}</span></div>}</>}
      {scanState === "scanning" && <div className="scan-stage"><div className="scan-preview">{previewUrl && <img src={previewUrl} alt="Financial screenshot being scanned" />}<span className="scan-line" /></div><LoaderCircle className="spin" /><strong>Reading every transaction</strong><span>{scanProgress}% complete</span><progress value={scanProgress} max="100" /><button className="secondary-action" onClick={cancelScan}>Cancel scan</button></div>}
      {(scanState === "review" || scanState === "saving") && <div className="review-stage"><div className="extract-status"><ShieldCheck size={21} /><span><strong>{batch.length} transaction{batch.length === 1 ? "" : "s"} found</strong><small>Review the numbers before saving to Supabase.</small></span></div><div className="analysis-summary" aria-label="Extracted transaction totals"><div><span>Spent / sent</span><strong>{formatMoney(analysisTotals.outgoingMinor)}</strong></div><div><span>ATM cash</span><strong>{formatMoney(analysisTotals.atmMinor)}</strong></div><div><span>Bank fees</span><strong>{formatMoney(analysisTotals.feesMinor)}</strong></div><div><span>Money received</span><strong>{formatMoney(analysisTotals.incomingMinor)}</strong></div></div><div className="statement-review-layout">{previewUrl && <img className="review-image" src={previewUrl} alt="Uploaded financial image preview" />}<div className="transaction-review-list">{batch.map((item, index) => <fieldset className="transaction-review" key={`${index}-${item.transactionId}`}><legend>Transaction {index + 1}</legend><div className="extract-grid"><label>Receiver, merchant, or ATM<input value={item.receiverName} onChange={(event) => updateBatch(index, { receiverName: event.target.value })} maxLength={120} /></label><label>Amount (PKR)<input inputMode="decimal" value={item.amount} onChange={(event) => updateBatch(index, { amount: event.target.value })} /></label><label>Direction<select value={item.direction} onChange={(event) => updateBatch(index, { direction: event.target.value as ExtractedTransaction["direction"] })}><option value="outgoing">Spent / sent</option><option value="incoming">Money received</option></select></label><label>Type<select value={item.kind} onChange={(event) => updateBatch(index, { kind: event.target.value as ExtractedTransaction["kind"] })}><option value="transfer_out">Transfer sent</option><option value="atm">ATM withdrawal</option><option value="bank_fee">Bank fee</option><option value="card">Card purchase</option><option value="transfer_in">Transfer received</option><option value="other">Other</option></select></label><label>Date & time<input value={item.occurredAt} onChange={(event) => updateBatch(index, { occurredAt: event.target.value })} maxLength={100} /></label><label>Channel<input value={item.channel} onChange={(event) => updateBatch(index, { channel: event.target.value })} maxLength={60} /></label><label className="full-field">Purpose note<input value={item.purposeNote} onChange={(event) => updateBatch(index, { purposeNote: event.target.value })} maxLength={500} placeholder="Optional" /></label></div></fieldset>)}</div></div>{scanError && <div className="scan-error" role="alert"><span>{scanError}</span></div>}<div className="privacy-copy"><ShieldCheck size={16} /><p><strong>Privacy:</strong> the source image is never uploaded. Only the fields you confirm and the OCR text are stored in your private Supabase rows, tied to your Clerk user ID.</p></div><div className="import-actions"><button className="secondary-action" onClick={() => { setScanState("idle"); setScanError(""); }}>Choose another</button><button className="primary-action" onClick={() => void confirmReceipt()} disabled={scanState === "saving"}>{scanState === "saving" ? "Saving transactions…" : `Save ${batch.length} transaction${batch.length === 1 ? "" : "s"}`}</button></div></div>}
    </section></div>}
  </div>;
}
