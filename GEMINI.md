# MPCA Hub - Workspace Instructions & Context

Welcome to the MPCA Hub repository. This file serves as the definitive reference for the project's architecture, technologies, file structures, and workflows.

---

## 1. System Overview & Architecture

MPCA Hub is a multi-tenant client operations and ERP application built for professional service firms. The platform operates on a serverless hybrid stack:
- **Frontend:** A React 19 Single Page Application (SPA) compiled with Vite, featuring dynamic dashboards, interactive Kanban boards, and print templates.
- **Backend:** An Express API server capable of running locally as a standard Node app (`server.ts` with Vite middleware) and deployed to **Vercel** as serverless functions (`api/index.ts`).
- **Data Integrations:**
  - **Google Sheets API:** Serves as the primary operational database storing rows for clients, engagements, tax compliances, tasks, deliverables, and logs.
  - **Google Drive API:** Used for managing, uploading, and serving binary assets such as user avatar presets and signed transmittal documents.
  - **MongoDB:** Stores user profiles (with bcrypt-hashed passwords), session data, audit logs, and persistent app states.
  - **Ably Realtime:** Manages pub-sub real-time synchronization of client activities, multi-user online indicators, live chat channels, and instant notification updates.

---

## 2. Tech Stack & Dependencies

- **Core Frameworks:** React `^19.1.1` (with `react-router-dom` using `HashRouter` for routing) and Express `^5.2.1`.
- **Database / API:** `mongodb` (v7.2), `googleapis` (v171.4 for Sheets/Drive), `google-auth-library` (v10.6).
- **Real-time:** `ably` (v2.21) on channel `mpca:chat` (and other operational channels).
- **UI & Analytics:** `lucide-react` (icons), `recharts` (reporting/dashboards), `react-to-print`, `html2canvas`, and `jspdf` (transmittal print layouts).
- **Transpiler / Tooling:** TypeScript (`~5.8.2`), Vite (`^6.2.0`), `tsx` (for executing TypeScript backend code directly in development).

---

## 3. Directory Structure & Key Files

```text
C:\mpca-app-serverless\
├── .gitignore
├── package.json              # Dependency declarations and dev scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite bundle & plugin-react config
├── vercel.json               # Serverless rewrite routes for Vercel
├── server.ts                 # Local Express + Vite Dev middleware runner
├── api/
│   └── index.ts              # Core backend entry point (Express API, 3500+ lines)
├── public/                   # Static public assets (logos, favicons)
├── src/
│   ├── index.tsx             # Frontend React app entry point
│   ├── App.tsx               # Root component (AppContext, Web Audio cue generator)
│   ├── types.ts              # Unified type definitions for entities
│   ├── constants.ts          # Color palettes, static select options
│   ├── components/           # Reusable interactive components
│   │   ├── ChatMessages.tsx  # Ably real-time chat
│   │   ├── KanbanBoard.tsx   # Workflow management board
│   │   ├── Sidebar.tsx       # Main navigation
│   │   └── TransmittalPrintTemplate.tsx # Document pdf rendering
│   ├── pages/                # Functional application views
│   │   ├── Dashboard.tsx     # KPI statistics and metrics
│   │   ├── Clients.tsx       # Onboarding, registry, and credentials
│   │   ├── Engagements.tsx   # Retainer and special project terms
│   │   └── Operations.tsx    # Deliverable logs, tax compliances
│   ├── services/
│   │   └── googleSheetsService.ts # Client-side Sheets CRUD connectors
│   └── utils/
│       ├── rbac.ts           # Role-Based Access Control logic (Admin, Manager, Client, etc.)
│       └── dateUtils.ts      # Utility functions for deadlining and task scheduling
```

---

## 4. Key Workflows & Engineering Patterns

### A. Local Development vs. Production Execution
- **Local Dev:** `npm run dev` executes `server.ts` via `tsx`. It spins up an Express server on Port 3000 and registers Vite as a middleware. This enables frontend HMR and server-side routes to run in parallel in a single shell context.
- **Production (Vercel):** Frontend assets are built into the `/dist` directory. Express routes are compiled. Requests to the backend are routed through `/api/*` handled by Vercel serverless adapters executing `api/index.ts`. Static file requests are served directly by Vercel.

### B. Sheets as a Database
The app utilizes Google Sheets as a structured key-value and tabular datastore. Columns map directly to TypeScript interfaces defined in `src/types.ts`. Avoid performing heavy join logic inside the sheet queries; perform filtering and relational resolution on the server/client side where memory is cheap.

### C. Web Audio Feedback Loop
To provide high-quality UX feedback without bloating the repository with static audio assets, the app generates interactive notification alerts dynamically using the web browser's native `AudioContext` inside `src/App.tsx`. 
- **Success:** Play dual ascending sine waves.
- **Chime/Error:** Play a descending triangle wave.
- **Click:** Play a short, low-amplitude click pulse.

---

## 5. Development Conventions

1. **Explicit Composition:** When adding or extending functionality, compose logic under clean utility functions rather than modifying the core `api/index.ts` or `src/App.tsx` unless necessary.
2. **Type Safety:** Never disable the type system (do not use type-cast overrides like `as any` where avoidable). Define new schemas and types inside `src/types.ts`.
3. **Styling Guidelines:** Rely on Vanilla CSS for modifications. Avoid importing Tailwind or utility styling frameworks unless specifically requested. Use existing component styling structures for cohesive, rich layouts.
4. **No Unrequested Commits:** Always perform modifications within local untracked/unstaged states. Do not perform `git commit` or `git add` unless specifically instructed by the user.
