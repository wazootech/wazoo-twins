# Runbook — Ethan Davidson Twin (v1)

## Prerequisites

- Deno (see https://deno.land — `curl -fsSL https://deno.land/install.sh | sh`)
- The World database lives in `~/workspace/wazoo-twins-data/` (outside the repo
  by design). Never commit seed data.
- Google OAuth (Gmail/Calendar) is **not** set up yet: the Gmail and Calendar
  connectors/importers exist but exit with a clear error until Ethan completes
  OAuth setup. MEMORY.md, tracker, and GitHub importers run without it.

## Commands (run from the repo root)

| Command                              | What it does                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `deno task seed`                     | Full seed import: MEMORY.md, daily notes, trackers, GitHub open state (Gmail/Calendar skipped with a warning until OAuth is set up) |
| `deno task seed --incremental`       | Overnight sync: deltas only                                                                                                         |
| `deno task smoke`                    | 20 smoke-test questions answered from the World, with citations                                                                     |
| `deno task eval`                     | Held-out eval set + baseline scores                                                                                                 |
| `deno task brief --kind morning`     | Morning brief (dry run writes to stdout only — never delivered anywhere by the Twin itself)                                         |
| `deno task brief --kind evening`     | Evening summary                                                                                                                     |
| `deno task server`                   | Long-running service entrypoint (Phase 1+)                                                                                          |
| `deno task check` / `deno task test` | Type-check / tests                                                                                                                  |
| `deno task lint` / `deno task fmt`   | Lint / format                                                                                                                       |

## Environment

| Variable                                                             | Meaning                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `TWIN_WORLD_BACKEND`                                                 | `libsql` (default, durable local) \| `memory` (in-memory, tests/dev) \| `hosted` (worlds-api data plane) |
| `TWIN_WORLD_PATH`                                                    | LibSQL database path (default `~/workspace/wazoo-twins-data/world.db`)                                   |
| `TWIN_WORLD_ID` / `TWIN_WORLD_API_KEY`                               | Hosted backend: world id + `wzw_` key                                                                    |
| `TWIN_MODEL_PROVIDER`                                                | `deepseek` (default) \| `frontier`                                                                       |
| `DEEPSEEK_API_KEY` / `FRONTIER_API_KEY`                              | Model keys (never committed). Without a key, draft prose falls back to deterministic templates.          |
| `GITHUB_TOKEN`                                                       | GitHub read token for the GitHub importer/agent (or `gh` CLI auth)                                       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | Google OAuth for Gmail/Calendar (needed before those importers can run)                                  |

## Cron jobs

See `src/service/cron.ts`: morning brief 7:30am PT, evening summary 6pm PT,
overnight sync 3am PT. Registered as runtime crons by the parent agent.

## Recovery

- World DB corrupt or suspect: delete `~/workspace/wazoo-twins-data/world.db`
  and re-run `deno task seed`. The seed is reproducible from source files.
- Bad seed batch: the importer quarantines it (see `data/quarantine/` under the
  data dir) and reports; nothing half-lands.
- Rotate keys: update `.env` (gitignored), restart the service.
