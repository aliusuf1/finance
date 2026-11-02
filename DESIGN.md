---
name: Hisab
description: A calm, receipt-led financial ledger for private, read-only money tracking.
colors:
  petrol-ink: "#072b3a"
  muted-petrol: "#365564"
  mineral-paper: "#f5f8f7"
  white: "#ffffff"
  ledger-line: "#d6e1e2"
  ledger-line-strong: "#b8cacc"
  action-turquoise: "#008d8b"
  deep-turquoise: "#006d6b"
  turquoise-wash: "#dff2f1"
  restrained-saffron: "#d88b16"
  confirmed-green: "#15845e"
typography:
  display:
    fontFamily: "Roboto Condensed, sans-serif"
    fontSize: "clamp(35px, 3.4vw, 51px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Archivo Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  indicator: "3px"
  badge: "6px"
  control: "8px"
  field: "9px"
  nav: "10px"
  surface: "12px"
  panel: "14px"
  modal: "16px"
  circular: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  control: "12px"
  section: "16px"
  panel: "20px"
  roomy: "24px"
  page: "28px"
components:
  button-primary:
    backgroundColor: "{colors.action-turquoise}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "33px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.deep-turquoise}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.turquoise-wash}"
    textColor: "{colors.deep-turquoise}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.petrol-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    height: "38px"
    padding: "0 10px"
  navigation-active:
    backgroundColor: "#0d5060"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.nav}"
    height: "44px"
    padding: "0 12px"
  receipt:
    backgroundColor: "{colors.white}"
    textColor: "{colors.petrol-ink}"
    rounded: "0"
    padding: "19px 20px 18px"
  inspector-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.petrol-ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: Hisab

## Overview

**Creative North Star: “The Living Receipt Ledger”**

Hisab turns a bank receipt into an ongoing financial record: the dense transaction ledger and the selected transaction’s human purpose stay visible together. The interface feels calm, exact, and private—closer to a well-kept account book than a promotional fintech dashboard. It deliberately avoids a generic grid of metric cards.

The system combines mineral-paper surfaces, petrol ink, thin ruled dividers, restrained turquoise actions, small saffron signals, and condensed financial figures. Density is intentional: desktop preserves a scan-efficient operating surface, while smaller layouts progressively remove secondary metadata and recast rows for touch without losing the transaction-and-receipt relationship.

**Key Characteristics:**

- Receipt-led split view with a dense ledger and contextual inspector.
- Deep-ink navigation rail and pale, low-chroma working surfaces.
- Turquoise reserved for actions, selection, connectivity, and trustworthy emphasis.
- Condensed numerals for balances and amounts; humanist sans-serif for working text.
- Ruled lines, dashed receipt separators, and tonal fills provide most structure.

## Colors

The palette is a cool mineral neutral field anchored by near-navy petrol ink, with turquoise used sparingly for interaction and saffron for exceptional notices.

### Primary

- **Action Turquoise** (`#008d8b`): Primary actions, selected-row rails, and active interaction cues.
- **Deep Turquoise** (`#006d6b`): Hover states, secondary action text, charts, and durable turquoise emphasis.
- **Turquoise Wash** (`#dff2f1`): Connected states, selected rows, and low-intensity action surfaces.

### Secondary

- **Restrained Saffron** (`#d88b16`): Synthetic-data notices, notification dots, and small exceptional accents; never a broad surface color.
- **Confirmed Green** (`#15845e`): Completed status, positive amounts, connection dots, and saved-state feedback.

### Neutral

- **Petrol Ink** (`#072b3a`): Primary text, sidebar field, and the strongest structural anchor.
- **Muted Petrol** (`#365564`): Supporting copy and secondary metadata.
- **Mineral Paper** (`#f5f8f7`): App background and the cool paper tone behind working surfaces.
- **White** (`#ffffff`): Balance strip, receipt, controls, and elevated working cards.
- **Ledger Line** (`#d6e1e2`): Standard dividers and control borders.
- **Strong Ledger Line** (`#b8cacc`): Dashed receipt rules and higher-emphasis field borders.

### Named Rules

**The Action-Only Turquoise Rule.** Turquoise signals an available action, an active selection, or a confirmed connection; it is not decorative background color.

**The Saffron Restraint Rule.** Saffron remains a small signal for demo status or attention and never competes with transaction content.

## Typography

**Display Font:** Roboto Condensed (sans-serif fallback)  
**Body Font:** Manrope Variable (sans-serif fallback)  
**Heading Font:** Archivo Variable (sans-serif fallback)

**Character:** Condensed numerals make PKR values feel ledger-like and immediately scannable. Archivo gives section headings compact authority, while Manrope keeps dense controls, metadata, and explanatory copy clear and contemporary.

### Hierarchy

- **Display** (700, `clamp(35px, 3.4vw, 51px)`, 1.05): Total balances and the dominant financial statement; use tight `-0.025em` tracking.
- **Headline** (700, `23px`, approximately 1.2): Major workspace and modal headings, using Archivo with tight tracking.
- **Title** (700, `14px`, 1.25): Compact card titles such as the spending breakdown.
- **Body** (400, primarily `12px`, 1.5): Working copy, transaction details, field content, and explanations. The shipped surface also uses 9–13px metadata to preserve ledger density.
- **Label** (800, `11px`, `0.02em`): Table headers, control labels, and compact actions; table headers are uppercase.

### Named Rules

**The Financial Figure Rule.** Use Roboto Condensed for balances and transaction amounts, not for prose or navigation.

**The Dense-but-Legible Rule.** Small metadata is supported by strong contrast, short phrases, generous row height, and clear grouping; do not shrink primary actions or merchant names to metadata scale.

## Layout

Desktop is a fixed-rail operating surface. The navigation rail is 216px wide, the top bar is 78px high, and the 154px balance statement spans the remaining width. Below it, the workspace divides into a flexible ledger (`minmax(620px, 1fr)`) and a 365px inspector. Ledger rows use explicit column tracks so dates, merchants, categories, amounts, channels, notes, and overflow actions stay vertically aligned.

The spatial rhythm is compact and regular: 8–12px inside controls, 16–20px inside cards, 24px for larger content blocks, and 28–30px at primary page edges. Thin solid rules separate durable regions; dashed rules are reserved for receipt/accounting semantics.

At 1180px, the rail contracts to 190px, the inspector to 330px, connection and welcome details disappear, and ledger metadata simplifies. At 920px, the rail becomes an off-canvas 250px drawer, the workspace becomes one column, and the inspector follows the ledger. At 680px, controls collapse further, the balance statement stacks, filters become a two-column grid, and each transaction becomes a two-line, three-column touch row. The mobile purpose-note editor becomes a fixed bottom sheet.

## Elevation & Depth

Hisab is flat by default. Depth comes primarily from tonal layering, ruled borders, selected-row fills, and the contrast between mineral paper and white. The receipt is the notable lifted object, while the import modal receives a stronger shadow because it temporarily sits above the entire product.

### Shadow Vocabulary

- **Receipt Ambient** (`0 18px 40px rgba(11,48,58,.09)`): Soft lift for the selected transaction receipt only.
- **Modal Ambient** (`0 28px 70px rgba(2,26,35,.28)`): Strong overlay separation for the receipt-import dialog.
- **Mobile Sheet Ambient** (`0 20px 60px rgba(3,31,40,.3)`): Bottom-sheet separation on narrow screens.
- **Inset Selection** (`inset 3px 0 #008d8b`): Structural selection rail for active navigation and transactions.

### Named Rules

**The Paper-First Depth Rule.** Prefer borders, paper tones, and selection fills before adding a shadow. Reserve ambient shadows for receipt-like objects and overlays.

## Shapes

The form language is softly rectangular and functional. Controls use 8–12px radii, cards use 14px, and modals use 16px; circular geometry is limited to status dots and the profile avatar. The receipt intentionally breaks the rounded-card pattern: its body has square corners and a repeating perforated/scalloped lower edge. The rotated, rounded-square brand mark echoes a stamped accounting symbol.

Borders are thin and cool. Solid rules indicate interface structure, while dashed rules indicate receipt or account separation. Small pills and badges use 6–7px radii rather than fully rounded capsules.

## Components

### Buttons

Buttons are compact, direct, and strongly stateful rather than oversized or promotional.

- **Shape:** 8–10px radii for standard action controls; 38–40px square icon controls use 9–10px radii.
- **Primary:** Action Turquoise with white label text, typically 33–38px high and 10–14px horizontal padding.
- **Hover / Focus:** Primary buttons deepen to Deep Turquoise. All interactive controls use a 3px translucent turquoise focus outline with 2px offset.
- **Secondary:** White or pale turquoise surfaces with ledger-line borders and Deep Turquoise text. Ghost actions are transparent and rely on icon plus label color.
- **Disabled:** Muted blue-gray (`#b7c8c8`) with a not-allowed cursor; never rely on opacity alone.

### Chips

- **Style:** Compact 6–7px-radius badges with tinted semantic fills. The synthetic-demo badge uses warm cream with saffron-brown text; mobile read-only uses pale confirmed-green.
- **State:** Chips communicate status or provenance, not broad navigation. Important status also includes text or an icon so color is never the only cue.

### Cards / Containers

- **Corner Style:** 14px for note and breakdown cards; 16px for modal panels; the signature receipt remains square.
- **Background:** White cards sit on a mineral or cool-gray inspector field.
- **Shadow Strategy:** Flat for ordinary cards; soft ambient shadow only for the receipt and overlays.
- **Border:** Usually omitted on white inspector cards; ledger and control boundaries use thin cool rules.
- **Internal Padding:** 16px for compact cards, 19–20px for the receipt, and 24px for the import panel.

### Inputs / Fields

- **Style:** White or near-white background, 1px Ledger Line border, 8–12px radius, and compact 38–42px height. Search fields combine a leading icon with 10–12px inset spacing.
- **Focus:** A 3px `rgba(0,141,139,.28)` outline with 2px offset; internal text inputs may remove their own outline when the containing label provides the visible field boundary.
- **Error / Disabled:** The shipped dashboard defines disabled buttons but no distinct error-field language; extend with text and icon before introducing new error color.

### Navigation

The navigation rail uses Petrol Ink, pale blue-gray labels, 44px rows, 10px corners, and 19px outline icons. Hover adds a subtle translucent white fill. The active item uses white text, a `#0d5060` field, and a 3px inset turquoise rail. On tablet and mobile, the rail slides in from the left over a dark scrim.

### Transaction Ledger

Each transaction row is a full-width button with a 64px desktop minimum height and a ruled lower edge. Hover uses a pale turquoise-gray wash. Selection uses Turquoise Wash plus a 3px inset turquoise rail. Merchant icons use softly tinted 33px rounded squares; category hue helps scanning but merchant, amount, and category text remain independently readable.

### Receipt Inspector

The selected record is rendered as a literal receipt: square white paper, soft ambient shadow, dashed internal rules, condensed amount, and a scalloped bottom edge. The note editor and spending breakdown sit beneath it as simpler rounded white cards so the receipt remains the visual focal point.

### Import Dialog

The import flow uses a centered 620px maximum-width modal over a petrol-black scrim. Its dashed turquoise dropzone is large and calm, with a moving scan line only during extraction. Extracted fields use a two-column review grid that collapses to one column on mobile; privacy behavior is stated in a neutral information block before confirmation.

## Do's and Don'ts

### Do:

- **Do** keep the ledger and selected receipt visually connected on wide screens.
- **Do** reserve Roboto Condensed for balances and transaction amounts.
- **Do** use thin solid rules for interface structure and dashed rules for receipt/accounting semantics.
- **Do** preserve keyboard focus outlines, readable contrast, text status labels, and reduced-motion behavior.
- **Do** simplify secondary metadata responsively while preserving merchant, amount, date, and note context.

### Don't:

- **Don't** replace the operating surface with a generic grid of detached metric cards.
- **Don't** use turquoise as a decorative wash across large regions; its rarity carries interaction meaning.
- **Don't** round the signature receipt into an ordinary card or remove its dashed and scalloped paper cues.
- **Don't** introduce heavy shadows on routine controls and cards.
- **Don't** imply money movement, live-bank certification, or production connectivity through visual language or copy.
