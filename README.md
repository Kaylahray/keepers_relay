# Keepers Relay — Chain Letter. Still thinking of the best name 

Next.js + TypeScript + Tailwind - Keepers Relay prototype.

A living CKB collectible that survives only if every Keeper passes the Cell on before the deadline.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- TanStack Query
- Framer Motion
- Lucide React
- date-fns

## Run

```bash
pnpm install
pnpm dev
```



## Project layout

```text
app/                  # Next.js App Router
components/           # UI (Chain dashboard + Keeper Pass layer)
hooks/                # React Query + countdown hooks
lib/api/              # In-memory mock Chain + Keeper services
lib/queryClient.ts
types/                # Chain + Keeper models
docs/                 # Product / backlog notes
```

## Demo notes

- Current Keeper is seeded as **Emma** (Keeper Pass privileges unlock for that name).
- **Pass the Baton** consumes the mock Cell and mints a successor with a fresh 24h window.
- **Demo: Make It Urgent** drops the timer to ~10s so you can test the dead state.
- State is in-memory only — refresh resets to the seeded Alice → Emma chain.
