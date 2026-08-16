# Customer domain

`Customer` owns `customer_profiles` and `customer_activities`. Activities are
the persisted continuation of the former customer-cart schema and can link to a
booking. Customer profile supports identity/contact fields plus religion and
allergy data.

Authenticated `/api/customer/profile` and `/api/customer/activity*` routes use
JWT. Booking/payment/review endpoints are presented under the same customer
prefix but owned by their respective modules.

Customer data must always be scoped to the authenticated user. Admin customer
views/toggle/delete are separate privileged operations. Audit coverage is not
universal and these lifecycle endpoints remain part of the coverage review;
do not infer an audit row without verifying the call site. Activity payload is
not a transaction truth for price or availability; final booking logic
revalidates server-side.
