# Staff domain

`Staff` owns `provider_staffs`, `staff_skills`, and `staff_schedules`, including
provider API/Next.js staff CRUD and staff assignment metadata.

Staff belongs to a provider and may belong to a branch. Skills link staff to
services; schedules define weekday and working intervals used by Availability.
Status/current-status participate in booking eligibility and operational queue
transitions.

All mutations require provider tenant scope. A branch account may only operate
within its assigned branch/menu permissions. Booking concurrency locks relevant
staff rows before accepting overlapping work; Redis is not the authoritative
slot lock.
