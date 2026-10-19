# DriveOS 30-day launch addendum (2026-10-15)

## Confirmed by user
- Referral fee per completed sale: over NT$10,000; use NT$11,000 as editable planning placeholder, not a contract.
- In-store close rate: around 60% reported; track actual cohort rate separately.
- Target: NT$100,000 cash received within 30 days, not booked revenue.
- User prefers text-based inbound leads; does not excel at outbound prospecting.
- User authorizes planning and integration assistance; this is NOT proof of dealer authorization, platform OAuth access, credentials, or legal authority to post or obtain data.

## Immediate build priority
1. Referral attribution: immutable lead id, source/post id, dealer assignment, timestamp, referral acceptance, dedupe and dispute status.
2. Cash accounting: expected referral fee, approved fee, invoiced fee, paid amount, payment date, refunds/chargebacks. Dashboard counts only cash received toward 100k.
3. Funnel: inbound inquiry -> qualified -> appointment -> attended -> deal -> dealer confirmation -> fee due -> paid. Appointment no-show distinct from attended.
4. Inventory sync: dealer-approved CSV import first; external API only if documented and authorized. Last sync, image rights, stale inventory flag, sold/removed automatic ad pause.
5. Ad studio: truthful copy only from verified inventory fields; user approval before any publication. Manual copy/paste fallback.
6. Messaging: manual entry and consent-based authorized integrations; do not scrape private messages or auto-DM.
7. Metrics: lead-to-appointment, appointment show-up, attended-to-sale, sales-to-paid, average days-to-payment; editable scenarios.
8. Export, authentication, audit log, backups and privacy-safe retention for customer personal data.

## Launch gates
- Signed written dealer referral agreement: per-car fee, qualifying sale, lead ownership, cancellation/refund, payout trigger and deadline, dispute process.
- Dealer grants written inventory/photo rights and provides actual export/API details.
- Social account/page credentials connected via official authorization only; user approves posting scope. Facebook Groups / Marketplace automation may not be supported by official APIs: do not promise it.
- First 10 verified vehicles and images; first 10 approved posts; manual lead capture operational.

## 30-day cash goal math
At NT$11k fee, 10 paid deals yield NT$110k. At 60% attended-to-close, approximately 17 attended appointments on expectation; actual performance uncertain. At 30% qualified-inquiry-to-attended, approximately 57 qualified inquiries. Do not count commissions until deposited.

## Suggested Codex first instruction
Implement the cash-based commission ledger, end-to-end referral funnel, dealer-approved CSV importer and human-reviewed ad workflow first, preserving the existing V3 prototype data via migration/export. Add seeded demo data clearly labeled as demo. Provide tests and a runnable setup README. Do not claim any real dealer, Meta, LINE, or AI integration until configured and tested.
