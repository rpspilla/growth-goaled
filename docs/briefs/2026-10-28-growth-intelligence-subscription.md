# Brief: sell the Growth Intelligence subscription in the app

**Owner decisions, Oct 28, 2026.** Build on `dev` after the sample brief (`2026-10-28-sample-demo.md`), or in parallel if it doesn't conflict. Stop for owner review on dev.growthgoaled.com, using Stripe **test mode**, before merging to `main`.

## What we're selling
**Growth Intelligence: $299/month, billed monthly, 12-month commitment.**

Includes, while the subscription is active, for the subscribing company:
- **Every live growth question**: unlimited assessments on all use cases that are not `comingSoon` and are in `sellableUseCases()` (today: Fix Churn, Growth Hiring Plan, Repeatable Sales Motion). Coming-soon questions become included automatically when they launch.
- **Action plan tracking and reassessments** on all of them.
- Advisory sessions are **not** included; they stay a separate offer (from $750).

The $149 one-off Growth Assessment stays on sale unchanged for founders who want a single answer.

## Commitment rules
- Billed $299 every month for a 12-month minimum term, starting on the subscription start date.
- **The commitment must be shown plainly before payment**: on the plan card, on the confirmation step before Stripe Checkout ("12-month commitment, billed monthly at $299. You can't cancel during the first 12 months."), and in Stripe Checkout via the custom text / terms field. Founder must tick a checkbox agreeing to the 12-month term before checkout opens; store the acceptance (user, timestamp, terms version) on the subscription record.
- Founders can't cancel themselves during the term. They can request cancellation from the billing page; it's recorded and takes effect at the end of the 12 months (`cancel_at` = term end).
- **After 12 months (owner default, confirm before building):** it continues **month-to-month, cancel anytime**, rather than renewing for another year. Make this a single config constant.
- Admins can cancel early or waive the term (e.g. goodwill), with a required note.

## Stripe
- One Product "Growth Intelligence" with a recurring monthly Price of $299 (`SUBSCRIPTION_PRICE_CENTS` stays the display source; add `STRIPE_SUBSCRIPTION_PRICE_ID` for the live/test Price id). Fail clearly if the price id's amount doesn't match `SUBSCRIPTION_PRICE_CENTS`, so the price shown is always the price charged.
- Checkout in `mode: "subscription"`, one subscription per **company** (founders with several companies subscribe each separately). Reuse a Stripe Customer per company.
- Enforce the term in our code: set the subscription's `cancel_at` only when a cancellation request is accepted, never earlier than term end. Use a subscription schedule only if it's needed for the post-term behaviour.
- **Billing page** (`/billing`, linked from the profile menu): plan, status, start date, commitment end date, next payment date and amount, payment method. Link to the **Stripe Customer Portal** for updating card and viewing invoices only. Configure the portal with cancellation **disabled**, and with plan switching disabled.
- Webhooks to handle (idempotent, signed, as today): `checkout.session.completed` (mode subscription), `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Keep the existing one-off assessment events working unchanged.
- Failed payment: status `past_due`; access continues for a **7-day grace period** with a banner asking to update the card; after that, new assessments are blocked until paid. Existing results stay readable.

## Access in the app
- Add `subscription` as a `use_case_activation` value. When a subscribed company starts any included question, activate it with `activation = subscription` and skip the $149 checkout.
- Results, history and action plans created while subscribed **stay readable** after the subscription ends. Starting new assessments or reassessing then needs a $149 purchase or resubscribing.
- Founders who already bought $149 assessments keep them. **No credit toward the subscription (owner default, confirm before building).**

## Where founders see it
- Library, each question page and the Snapshot: next to "Get this assessment · $149", show "Or get every growth question with **Growth Intelligence** · $299/month (12-month commitment)".
- Overview for subscribers: "Growth Intelligence · active · all growth questions included".
- Remove the "reserved, not shown" behaviour: `subscriptionAvailable` becomes true only when `STRIPE_SUBSCRIPTION_PRICE_ID` is set, so production stays safe until the owner adds it.
- Copy rule: no "Most popular", no unproven claims.

## Advisors and admins
- Portfolio and company view show plan (Free / Assessments / Growth Intelligence), status and term end.
- Admin: comp a subscription (no payment, with note and end date), cancel early or waive the term (note required). Analytics: active subscriptions, MRR from subscriptions, churned subscriptions.
- Events: `subscription_checkout_started`, `subscription_started`, `subscription_payment_failed`, `subscription_cancel_requested`, `subscription_ended`.

## Owner setup (list these in the end-of-milestone summary)
1. In Stripe (test first, then live), create the Product and the $299/month Price, and give the ids to Vercel as `STRIPE_SUBSCRIPTION_PRICE_ID` (Preview = test, Production = live).
2. **The live restricted key needs more permissions.** Today it only has Checkout Sessions: Write. List the exact extra permissions the code needs (expected: Customers, Subscriptions, Invoices read, Customer portal sessions, Prices read).
3. Add the new webhook events to the live webhook endpoint.
4. Configure the Customer Portal (cancellation and plan switching off).
5. Add the 12-month term to Growth Goaled's terms of service. **Owner to have this reviewed**; the app only displays and records acceptance.

## Done when
- In Stripe test mode on dev: subscribe → all three live questions run without paying $149 → payment failure → grace banner → recovery → cancellation request sets end of term → term end ends access to new assessments, existing results still readable.
- Commitment shown and accepted before checkout; acceptance stored.
- Unit tests for entitlement rules and term dates; webhook tests (idempotency, unknown events); e2e of subscribe and run an assessment; permission test that one company's subscription can't unlock another's.
- README pricing table updated. Then stop and summarise for owner review.
