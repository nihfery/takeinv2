# Availability domain

`Availability` owns eligible-staff resolution, schedule checks, and booking
conflict detection. It has no table of its own: it reads Staff schedules/skills,
Catalog service durations, Branch working rules, and existing Booking records.

Application actions `CheckConflict` and `ResolveEligibleStaff` exist, while the
relocated `BookingFlowService` remains the compatibility facade coordinating
several existing flows. Extraction is intentionally incremental.

Public eligible-staff/check-availability endpoints are rate-limited. A positive
read response is advisory; booking create/reschedule repeats validation inside
a PostgreSQL transaction with row locks. Redis can coordinate runtime services but
does not replace this database authority.
