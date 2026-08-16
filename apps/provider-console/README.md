# TAKEIN Provider Console

Standalone Next.js 16 application for the authenticated provider workspace. The interface uses local shadcn/ui Base Nova source components backed by Base UI primitives and Tailwind CSS v4. Marketing and registration remain in `apps/provider-landing`.

```bash
copy .env.example .env
npm ci
npm run dev
```

Open `http://127.0.0.1:5175/provider/login`. Authentication happens on the
console origin so its HttpOnly session cookie never needs a cross-domain scope.

## UI structure

- `src/components/ui` contains registry-managed shadcn/ui components.
- `src/dashboard/components` contains the icon rail, grouped navigation panel, compact topbar, workspace content, and shared data displays.
- `src/dashboard/menus` contains one component for each provider menu.
- `src/dashboard/config/navigation.js` controls groups, permissions, labels, icons, and descriptions.

The overview uses shadcn Chart and Base UI Progress/Select primitives to render live revenue, appointment outlook, booking pipeline, schedule, and queue data returned by the Go services. The same navigation panel is reused inside a Base UI Sheet on smaller screens.

Booking state changes and subscription purchases require confirmation before mutation requests are sent to the Go services.

## Provider access scopes

- Head Office accounts have no `branch_id` and can access every provider menu across all branches.
- Branch accounts have a `branch_id` and only receive menus explicitly assigned through **Access control**.
- Locations, Access control, Subscription, and Business profile are Head Office-only menus.
- Direct navigation to a menu outside the account scope is redirected before that menu's API request is sent.
