# Review domain

`Review` owns `branch_reviews` and `staff_reviews`. The historical generic
review table was split by migration; customer submits a review through an owned
booking code after the relevant booking conditions are met.

Public catalog returns branch/staff review summaries and detail lists. The
paginated `GET /api/reviews` feed exposes the latest branch reviews only for
active branches owned by active, document-verified provider accounts, with safe
branch context for the customer landing page. Review queries must not reveal
private customer fields beyond the approved response.
Branch review imagery is stored through media-service and is not
covered by the private KTP/NIB or chat-attachment storage guarantee.

Duplicate/unauthorized review prevention remains tied to customer/booking scope,
not a caller-supplied customer ID.
