# TAKEIN Provider Console

Standalone Next.js 16 application for the authenticated provider workspace. The interface uses local shadcn/ui Base Nova source components backed by Base UI primitives and Tailwind CSS v4. Marketing and registration remain in `apps/provider-landing`.

The dashboard shell and visual system are adapted from [Studio Admin](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) at the pinned commit recorded in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). The original template's demo data and routes are not used: all TAKEIN screens keep their own provider permissions and Go microservice APIs.

```bash
copy .env.example .env
npm ci
npm run dev
```

Open `http://127.0.0.1:5175/provider/login`. Authentication happens on the
console origin so its HttpOnly session cookie never needs a cross-domain scope.

## UI structure

- `src/components/ui` contains registry-managed shadcn/ui components.
- `src/dashboard/components` contains the Studio Admin-style collapsible sidebar, compact topbar, workspace content, and shared data displays.
- `src/dashboard/menus` contains one component for each provider menu.
- `src/dashboard/config/navigation.js` controls groups, permissions, labels, icons, and descriptions.

The overview uses shadcn Chart and Base UI Select primitives to render live revenue, appointments, operational status, and transactions returned by the Go services. The same navigation panel is reused inside a Base UI Sheet on smaller screens.

Booking state changes and subscription purchases require confirmation before mutation requests are sent to the Go services.

## Provider access scopes

- Head Office accounts have no `branch_id` and can access every provider menu across all branches.
- Branch accounts have a `branch_id` and only receive menus explicitly assigned through **Access control**.
- Locations, Access control, Subscription, and Business profile are Head Office-only menus.
- Direct navigation to a menu outside the account scope is redirected before that menu's API request is sent.
