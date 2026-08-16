# Promotion domain

`Promotion` owns `coupons`, admin API/Next.js coupon CRUD, public coupon listing,
and rate-limited coupon validation through `CouponService`.

Coupon applicability includes status, date/usage, product/service constraints,
and existing pricing rules. Client-provided discount/total fields are not
authoritative; checkout/booking validates the coupon against server-side data
before committing totals.

Coupon changes can affect booking revenue and should be treated as privileged
admin operations. Concurrency around limited usage must remain transactionally
safe when expanded; current behavior must not be replaced by cache-only counts.
