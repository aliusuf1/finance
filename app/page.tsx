"use client";

import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, BookOpenText, ChevronDown,
  CircleDollarSign, Eye, FileText, Fuel, Gauge, Landmark, Menu, MessageSquareText,
  MoreHorizontal, Search, Settings, ShieldCheck, ShoppingBag, ShoppingBasket,
  Tag, Upload, Utensils, WalletCards, X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Transaction = {
  id: number; merchant: string; detail: string; category: string; amount: number;
  date: string; time: string; channel: string; account: string; note: string;
  icon: string; status?: string; reference: string;
};

const transactions: Transaction[] = [
  { id: 1, merchant: "Sakhawat Hussain", detail: "Raast transfer", category: "Transfers", amount: -10300, date: "31 Oct 2026", time: "6:46 PM", channel: "Raast", account: "HBL Current ··8390", note: "", icon: "transfer", status: "Completed", reference: "1525772315" },
  { id: 2, merchant: "Al-Fatah", detail: "Gulberg, Lahore", category: "Groceries", amount: -6780, date: "31 Oct 2026", time: "1:18 PM", channel: "Debit card", account: "HBL Current ··8390", note: "Monthly groceries", icon: "groceries", reference: "FT2620411048" },
  { id: 3, merchant: "PSO", detail: "Clifton, Karachi", category: "Transport", amount: -4500, date: "30 Oct 2026", time: "8:36 PM", channel: "Debit card", account: "Meezan Savings ··2146", note: "Fuel", icon: "fuel", reference: "POS89670233" },
  { id: 4, merchant: "Kababees", detail: "DHA Phase 6, Karachi", category: "Dining", amount: -3250, date: "29 Oct 2026", time: "7:18 PM", channel: "Debit card", account: "HBL Current ··8390", note: "Dinner with family", icon: "dining", reference: "POS45100842" },
  { id: 5, merchant: "HBL ATM", detail: "Tariq Road, Karachi", category: "Cash", amount: -10000, date: "29 Oct 2026", time: "11:03 AM", channel: "ATM withdrawal", account: "HBL Current ··8390", note: "", icon: "cash", reference: "ATM88172052" },
  { id: 6, merchant: "Daraz", detail: "Online purchase", category: "Shopping", amount: -5499, date: "28 Oct 2026", time: "6:27 PM", channel: "Debit card", account: "Meezan Savings ··2146", note: "Household items", icon: "shopping", reference: "ECOM9917350" },
  { id: 7, merchant: "Salary · ABC (Pvt) Ltd", detail: "Monthly salary", category: "Income", amount: 120000, date: "27 Oct 2026", time: "9:11 AM", channel: "Bank credit", account: "HBL Current ··8390", note: "October salary", icon: "income", reference: "IBFT1200842" },
  { id: 8, merchant: "PTCL", detail: "Internet bill", category: "Bills", amount: -3199, date: "26 Oct 2026", time: "8:40 AM", channel: "Direct debit", account: "HBL Current ··8390", note: "Home internet", icon: "bills", reference: "DD50741928" },
];

const iconMap = { transfer: ArrowUpRight, groceries: ShoppingBasket, fuel: Fuel, dining: Utensils, cash: Landmark, shopping: ShoppingBag, income: ArrowDownLeft, bills: FileText };
const navItems = [[Gauge, "Overview"], [ArrowLeftRight, "Transactions"], [WalletCards, "Accounts"], [CircleDollarSign, "Budgets"], [BookOpenText, "Reports"], [Tag, "Payees"]] as const;

function money(value: number) { return `${value < 0 ? "−" : "+"} PKR ${Math.abs(value).toLocaleString("en-PK")}`; }

export default function Home() {
  const [selected, setSelected] = useState<Transaction>(transactions[0]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [privacy, setPrivacy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [mobileNoteOpen, setMobileNoteOpen] = useState(false);

  const filtered = useMemo(() => transactions.filter((item) => {
    const match = `${item.merchant} ${item.detail} ${item.note} ${notes[item.id] ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return match && (category === "All categories" || item.category === category);
  }), [search, category, notes]);

  function selectTransaction(item: Transaction) {
    setSelected(item); setDraft(notes[item.id] ?? item.note); setSaved(false); setMobileNoteOpen(true);
  }
  function saveNote() {
    setNotes((current) => ({ ...current, [selected.id]: draft.trim() }));
    setSaved(true); window.setTimeout(() => setSaved(false), 2400);
  }
  function scanReceipt(file?: File) {
    if (!file) return;
    setFileName(file.name); setScanning(true); setExtracted(false);
    window.setTimeout(() => { setScanning(false); setExtracted(true); }, 1200);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row"><span className="brand-mark"><span /></span><span className="brand">Hisab</span><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
        <nav aria-label="Primary navigation">
          {navItems.map(([Icon, label]) => <button key={label} className={label === "Transactions" ? "nav-active" : ""}><Icon size={19} strokeWidth={1.8} /><span>{label}</span></button>)}
        </nav>
        <div className="sidebar-rule" />
        <button className="nav-secondary"><Settings size={19} /><span>Settings</span></button>
        <div className="trust-note"><ShieldCheck size={23} /><strong>Read-only by design</strong><p>Hisab can read your transactions. It cannot move money or change your bank account.</p><button>How access works <ArrowUpRight size={15} /></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button><span className="mobile-readonly"><ShieldCheck size={14} /> Read-only</span>
          <div className="welcome"><span>Good morning, Ali</span><small>Monday, 2 November</small></div>
          <label className="global-search"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions, payees, or notes" aria-label="Search transactions" /><kbd>⌘ K</kbd></label>
          <button className="privacy-button" onClick={() => setPrivacy(!privacy)} aria-pressed={privacy}><Eye size={18} /><span>{privacy ? "Show values" : "Privacy mode"}</span></button>
          <button className="notification" aria-label="Notifications"><Bell size={19} /><span /></button>
          <button className="profile" aria-label="Open profile">AY</button>
        </header>

        <section className="balance-strip" aria-labelledby="balance-title">
          <div><p id="balance-title">Total balance across 3 accounts</p><h1>{privacy ? "PKR ••••••" : "PKR 284,650"}</h1><span className="month-change"><ArrowUpRight size={14} /> PKR 13,230 this month</span></div>
          <div className="account-splits"><div><span>Current accounts</span><strong>{privacy ? "••••••" : "PKR 224,300"}</strong></div><div><span>Savings</span><strong>{privacy ? "••••••" : "PKR 60,350"}</strong></div></div>
          <button className="connection"><span className="connection-dot" /><span><strong>3 accounts connected</strong><small>Read-only · refreshed 8 min ago</small></span><ChevronDown size={17} /></button>
        </section>

        <div className="workspace">
          <section className="ledger" aria-labelledby="transactions-title">
            <div className="ledger-heading"><div><h2 id="transactions-title">Transactions</h2><p>28 October – 2 November 2026 · <span>Synthetic demo data</span></p></div><div className="ledger-actions"><button className="import-button" onClick={() => setImportOpen(true)}><Upload size={16} /> Import receipt</button><button className="export-button"><ArrowDownLeft size={16} /> Export</button></div></div>
            <div className="filters">
              <label className="ledger-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search ledger" /></label>
              <select aria-label="Account"><option>All accounts</option><option>HBL Current</option><option>Meezan Savings</option></select>
              <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category"><option>All categories</option>{[...new Set(transactions.map((item) => item.category))].map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Period"><option>This month</option><option>Last month</option></select>
            </div>
            <div className="table-head" aria-hidden="true"><span>Date & time</span><span>Merchant / recipient</span><span>Category</span><span>Amount</span><span>Account / channel</span><span>Note</span><span /></div>
            <div className="transaction-list">
              {filtered.length ? filtered.map((item) => {
                const Icon = iconMap[item.icon as keyof typeof iconMap]; const currentNote = notes[item.id] ?? item.note;
                return <button key={item.id} className={`transaction-row ${selected.id === item.id ? "selected-row" : ""}`} onClick={() => selectTransaction(item)}>
                  <span className="row-date"><strong>{item.date.replace(" 2026", "")}</strong><small>{item.time}</small></span>
                  <span className={`merchant-icon icon-${item.icon}`}><Icon size={19} /></span>
                  <span className="merchant"><strong>{item.merchant}</strong><small>{item.detail}</small></span>
                  <span className="category">{item.category}</span>
                  <strong className={item.amount > 0 ? "amount income" : "amount"}>{privacy ? "PKR ••••" : money(item.amount)}</strong>
                  <span className="channel"><strong>{item.channel}</strong><small>{item.account}</small></span>
                  <span className={`row-note ${currentNote ? "has-note" : ""}`}><MessageSquareText size={16} /><span>{currentNote || "Add note"}</span></span>
                  <MoreHorizontal size={18} className="more" />
                </button>;
              }) : <div className="empty-state"><Search size={26} /><strong>No transactions found</strong><span>Try a different search or category.</span></div>}
            </div>
          </section>

          <aside className="inspector" aria-label="Selected transaction details">
            <div className="inspector-title"><div><span>Selected transaction</span><strong>{selected.id} of {transactions.length}</strong></div><span className="demo-badge">Synthetic demo</span></div>
            <div className="receipt">
              <div className="receipt-head"><span className={`merchant-icon icon-${selected.icon}`}>{(() => { const Icon = iconMap[selected.icon as keyof typeof iconMap]; return <Icon size={21} />; })()}</span><div><span>{selected.category === "Transfers" ? "Raast transfer" : selected.category}</span><strong>{selected.merchant}</strong></div><ShieldCheck size={22} /></div>
              <div className="receipt-amount"><small>Amount</small><strong className={selected.amount > 0 ? "income" : ""}>{privacy ? "PKR •••••" : `PKR ${Math.abs(selected.amount).toLocaleString("en-PK")}`}</strong></div>
              <dl><div><dt>Date & time</dt><dd>{selected.date}, {selected.time}</dd></div><div><dt>Status</dt><dd className="status"><span />{selected.status ?? "Completed"}</dd></div><div><dt>Account</dt><dd>{selected.account}</dd></div><div><dt>Channel</dt><dd>{selected.channel}</dd></div><div><dt>Reference</dt><dd>{selected.reference}</dd></div></dl>
            </div>

            <div className="note-editor">
              <label htmlFor="purpose"><span><MessageSquareText size={17} /> Purpose note</span><small>Private to you</small></label>
              <textarea id="purpose" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What was this for?" maxLength={120} />
              <div className="note-meta"><span>{draft.length}/120</span><button onClick={saveNote} disabled={!draft.trim()}>{saved ? "Saved" : "Save note"}</button></div>
              {saved && <p className="saved-message" role="status"><ShieldCheck size={15} /> Note saved to this transaction</p>}
            </div>

            <div className="breakdown">
              <div className="breakdown-title"><h3>Spending breakdown</h3><button>November <ChevronDown size={15} /></button></div>
              {[["Groceries", 22530, 78], ["Transport", 11720, 42], ["Bills", 8598, 31], ["Dining", 6250, 24], ["Shopping", 5499, 20]].map(([label, value, width]) => <div className="bar-row" key={label}><span>{label}</span><strong>PKR {(value as number).toLocaleString("en-PK")}</strong><i><b style={{ width: `${width}%` }} /></i></div>)}
            </div>
          </aside>
        </div>
      </main>
      {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu overlay" />}
      {mobileNoteOpen && <section className="mobile-note-sheet" aria-label="Add purpose note">
        <div><span>Selected transaction</span><button onClick={() => setMobileNoteOpen(false)} aria-label="Close purpose note"><X size={18} /></button></div>
        <strong>{selected.merchant}</strong><small>{privacy ? "PKR •••••" : `PKR ${Math.abs(selected.amount).toLocaleString("en-PK")}`} · {selected.date}, {selected.time}</small>
        <label htmlFor="mobile-purpose">Purpose note</label><textarea id="mobile-purpose" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What was this for?" maxLength={120} />
        <button className="mobile-save" onClick={() => { saveNote(); setMobileNoteOpen(false); }} disabled={!draft.trim()}>Save note</button>
      </section>}
      {importOpen && <div className="import-overlay" role="presentation" onMouseDown={() => setImportOpen(false)}>
        <section className="import-panel" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="import-head"><div><h2 id="import-title">Import a receipt</h2><p>Upload a bank receipt or transaction screenshot. Review every field before saving.</p></div><button onClick={() => setImportOpen(false)} aria-label="Close receipt import"><X size={20} /></button></div>
          {!extracted ? <label className={`dropzone ${scanning ? "is-scanning" : ""}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => scanReceipt(event.target.files?.[0])} disabled={scanning} />
            {scanning ? <><span className="scan-line" /><ShieldCheck size={30} /><strong>Reading transaction details…</strong><small>{fileName}</small></> : <><Upload size={30} /><strong>Choose a screenshot or receipt</strong><small>PNG, JPG or WebP · maximum 10 MB</small></>}
          </label> : <div className="extracted-result">
            <div className="extract-status"><ShieldCheck size={21} /><span><strong>Fields extracted</strong><small>Demo extraction based on your HBL receipt</small></span></div>
            <div className="extract-grid"><label>Recipient<input defaultValue="SAKHAWAT HUSSAIN" /></label><label>Amount<input defaultValue="PKR 10,300" /></label><label>Date & time<input defaultValue="31 Oct 2026 · 6:46:15 PM" /></label><label>Channel<input defaultValue="Raast" /></label><label className="full-field">Transaction ID<input defaultValue="1525772315" /></label><label className="full-field">Purpose note<input placeholder="What was this for?" /></label></div>
            <div className="privacy-copy"><ShieldCheck size={16} /><p><strong>Privacy default:</strong> the source image is discarded after extraction. Only fields you confirm are saved.</p></div>
            <div className="import-actions"><button className="secondary-action" onClick={() => { setExtracted(false); setFileName(""); }}>Choose another</button><button className="primary-action" onClick={() => { setImportOpen(false); setExtracted(false); }}>Confirm transaction</button></div>
          </div>}
        </section>
      </div>}
    </div>
  );
}
