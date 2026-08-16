# Subscription domain

`Subscription` owns `subscription_plans` and `provider_subscriptions`, provider
entitlement checks, owner-only plan purchase API, subscription grant
command, and subscription payment lifecycle fields.

Only the provider owner may purchase/manage its entitlement; a branch account
cannot use owner-only routes. Midtrans charge/status processing shares the
Payment gateway service and uses transaction/lock/idempotent transition rules.
Late settlement is recorded for explicit resolution instead of silently
rewriting an incompatible subscription lifecycle.

Eligibility logic may read current trial/subscription state when deciding
provider capabilities. Seed/grant commands are operational tools and must not
be run broadly on production without an approved, audited plan.
