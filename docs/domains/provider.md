# Provider domain

## Ownership

`Provider` owns `provider_profiles`, `provider_roles`, and
`provider_role_menu_permissions`, plus onboarding, status/document verification,
document storage orchestration, dashboard queries, account scope, menu access,
and salon eligibility checks.

Provider owner accounts have `provider_id=null`; branch/staff-style subaccounts
resolve back to the owner tenant through `ProviderAccountScope` /
`ProviderMenuAccess`. An authenticated account is not sufficient: active status,
verified KTP/NIB, branch assignment, role/menu permission, and owner-only checks
are enforced where applicable.

New KTP/NIB objects are private and accessed through signed routes with
owner/admin authorization. Public business imagery is stored through
media-service. See `docs/domains/media.md`.

Provider eligibility exposed publicly requires an active provider profile with
verified documents; branch/service/staff readiness is evaluated by the setup
and salon eligibility services.
