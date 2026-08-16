# TAKEIN Admin Web

Standalone Next.js 16 administrator dashboard backed by the Go edge API. The interface uses local shadcn/ui source components with Base UI primitives and Tailwind CSS v4.

```bash
copy .env.example .env
npm ci
npm run dev
```

Open `http://127.0.0.1:5176/admin/login`.

## Structure

- `src/components/ui` — registry-managed shadcn/ui components using Base UI.
- `src/admin/components` — reusable admin shell, table, status, and action components.
- `src/admin/sections` — one component for every dashboard menu.
- `src/admin/navigation.js` — navigation groups and Go API endpoint mapping.

Administrative mutations use a confirmation dialog before requests are sent to the Go services.
