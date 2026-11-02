import type { Metadata } from "next";
import "@fontsource-variable/archivo";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hisab — Your money, accounted for",
  description: "A secure, read-only Pakistan-first personal finance dashboard.",
  robots: { index: false, follow: false },
};

const designContract = `
THESIS: A bank receipt becomes a living financial ledger; the transaction and its human purpose stay together. Refuses the generic fintech metric-card grid.
OWN-WORLD: Mineral paper, petrol ink, action-only turquoise, restrained saffron, ruled ledger lines, compact receipt edges, condensed figures.
STORY: See every connected transaction, understand its source, select the exact receipt, and save why it happened without gaining money-movement access.
FIRST VIEWPORT: Deep-ink navigation rail, full-width balance statement, dense ledger in the main pane, selected receipt and note editor pinned at right.
FORM: Receipt-ledger operating surface, grounded direction four; seed 887bca2c. Approved comp: .impeccable/mocks/hisab-dashboard-approved.png.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><span hidden dangerouslySetInnerHTML={{ __html: `<!-- ${designContract} -->` }} />{children}</body></html>;
}
