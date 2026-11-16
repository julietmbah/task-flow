# TaskFlow — Day 9, Step 2: Responsive My Tasks

This bundle is for your **existing frontend**. Do not restart or reinitialize the project.

## Copy the included files into `frontend/`

- `src/App.tsx` — updated full file: adds the protected `/tasks` route.
- `src/pages/DashboardPage.tsx` — updated full file: activates sidebar navigation and reuses the existing navbar/sidebar on the tasks route.
- `src/pages/TasksPage.tsx` — new full file: loads actual tasks, search, status filters, sorting, refresh, loading/empty/error states.
- `src/index.css` — updated full file: retains the dashboard styles and adds responsive styles for My Tasks at the bottom. **This remains the only stylesheet for your app**.

Keep your existing `src/types/task.ts` and `src/services/tasksApi.ts` from Step 1. No backend changes are needed.

## Verification

From `C:\Users\user\projects\task-flow\frontend`:

```powershell
npm run build
npm run lint
npm run dev
```

Open `http://localhost:3000`, sign in, select **My tasks** in the sidebar.

Check: the sidebar highlight and navbar breadcrumb update; the real task list loads; search, status, and sort controls work; Refresh works; dark/light mode and Sign Out continue to work.

Using browser device emulation, check widths 320px, 375px, 768px, 1024px and desktop for readable text, usable controls, and no horizontal scrolling.

**Scope:** This is the verified-listing step. Creating/editing/deleting tasks comes next, after you send your build/lint result and a screenshot.
