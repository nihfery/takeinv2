# Provider dashboard structure

- `ProviderDashboard.jsx` owns authentication, section data loading, and mutations shared across menus.
- `components/Topbar.jsx`, `components/Sidebar.jsx`, and `components/ContentArea.jsx` own the compact topbar, icon rail/grouped sidebar, and workspace regions.
- `components/common/` contains reusable tables, status badges, metrics, loading, empty, and error states.
- `config/navigation.js` is the single source of truth for menu labels, icons, and permissions.
- The same navigation policy distinguishes Head Office from branch accounts and supplies the permission checklist in Access control.
- `lib/data.js` contains formatting and response helpers.
- `menus/<menu>/` owns the UI and forms for one provider menu; `menus/overview/` also owns the data filters and analytics charts.
- `../components/ui/` contains the shadcn/ui Base Nova component source generated for this application.
- `../styles.css` contains Tailwind v4 theme tokens and the small amount of provider-specific visual CSS.

The root `src/ProviderDashboard.jsx` is intentionally only a compatibility re-export for existing App Router pages.
