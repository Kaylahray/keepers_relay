# Relay SDK surface (in-app)

Keepers Relay hosts the Stateful Event Engine as extractable modules under `lib/relay`.
Grant deliverable: scripts + builders + state machine shaped so Living Relay (and others) can reuse them without forking Arena.

| Path | Role | Later package |
|------|------|----------------|
| `lib/relay/core/state-machine.ts` | Status edges, mode rules, pot display | `@relay-ckb/core` |
| `lib/relay/core/domain-events.ts` | Full domain event catalog + in-process bus | `@relay-ckb/core` |
| `lib/relay/core/notifications.ts` | Domain → notification intents | `@relay-ckb/core` |
| `lib/relay/ckb.ts` | Event Cell codecs + tx builders (+ treasury) | `@relay-ckb/ckb` |
| `lib/registry/event-cell*` | Byte layout + CCC builders (source of truth) | same |
| `scripts/event-engine/` | `event-cell-type` + `event-treasury-lock` | OSS contracts |
| `lib/server/events-store.ts` | App adapter (mock SoT → Neon) | Keepers app |
| `lib/db/schema.ts` | `relay_events` / players / turns / questions | Keepers + indexer |

**Do not** import `lib/relay/ckb` from Node API routes that must stay free of `@ckb-ccc/connector-react`. Use `lib/relay` (core) on the server; use `lib/relay/ckb` in client / wallet flows.

Peek recent domain events: `GET /api/relay/bus` · notifications: `GET /api/relay/bus?kind=notifications`.
