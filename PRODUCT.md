# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: Next.js with TypeScript. Chosen for server-side boundaries, mature authentication and security middleware, and a strong production ecosystem. The hosted prototype may use the Sites-compatible Next.js runtime.

## Users

People in Pakistan who use debit cards, credit cards, bank transfers, Raast, and cash withdrawals and want one trustworthy place to understand their spending.

## Product Purpose

Connect authorized financial accounts with read-only consent, automatically organize incoming transaction data, and show how much was spent, where or with whom, and when. Users can attach a private purpose note to a transaction immediately or later.

## Positioning

A Pakistan-first personal finance record that treats local rails, PKR, transfers, cash withdrawals, merchant spending, and user-added context as one searchable timeline without gaining the ability to move money.

## Operating Context

Daily mobile and desktop use after banking activity. Common records include debit and credit card purchases, ATM withdrawals, Raast transfers, bank transfers, merchant names, account aliases, timestamps, and transaction references.

## Capabilities and Constraints

- Financial access must be read-only. The product must never initiate transfers, alter bank accounts, or retain online-banking credentials.
- Bank or aggregator access tokens must remain server-side and encrypted at rest; sensitive actions require authorization checks, audit logging, rate limiting, and secure session handling.
- Transaction records include amount, counterparty or merchant, date and time, channel, account, category, status, and a user-authored purpose note.
- Users can upload a bank receipt or transaction screenshot for visual extraction of recipient or merchant, amount, date and time, reference, masked account, and channel. Extracted fields require user review before saving; source-image retention is an explicit privacy choice.
- Receipt ingestion is production-backed: OCR runs locally in the browser, confirmed fields and OCR text are stored in D1, and every record is scoped to the authenticated Site user. Live Pakistan bank connectivity remains provider-dependent and must use supported, authorized bank or regulated aggregator APIs.
- The interface uses PKR and Pakistan-relevant terminology, including Raast.

## Brand Commitments

Working name: Hisab. Voice: calm, direct, private, and never promotional about security. The attached HBL transaction receipt is functional reference material, not a visual brand to copy.

## Evidence on Hand

- User-supplied HBL transfer receipt image at `C:\Users\123\Downloads\9305b732-eeed-4ac2-916b-f254ec5420eb.jfif`, showing a successful PKR 10,300 Raast transfer with receiver, masked account, date, time, and transaction ID.
- No production bank API credentials, supported-bank agreement, customer claims, benchmarks, or compliance certification are supplied; future work must not fabricate them. Receipt OCR does not imply direct bank connectivity.

## Product Principles

- Read-only by architecture, not only by copy.
- Make every rupee traceable to a transaction and optional human context.
- Explain access and privacy in plain language.
- Default to useful local conventions and honest synthetic demonstrations.
- Keep the transaction timeline fast to scan and easy to search.

## Accessibility & Inclusion

Keyboard-operable controls, visible focus states, readable contrast, responsive layouts, reduced-motion support, and clear labels that do not rely on color alone.
