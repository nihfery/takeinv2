# Branch domain

`Branch` owns `provider_branches` and provider API/Next.js branch CRUD,
staff assignment, status, preview, address/location, working day/hour, holidays,
and branch imagery.

Every branch belongs to one provider owner. Provider owner operations are
scoped by provider ID; branch accounts are restricted to their assigned branch
and menu permissions. Public catalog only starts from active branches whose
provider profile is active and document-verified, then applies search/location,
category, date, distance, price, and rating filters as requested.

Branch images are stored through media-service. KTP/NIB are not branch
assets and stay private in Provider/Media. Deleting or deactivating a branch
must account for booking/staff/service references rather than bypassing foreign
key and business checks.
