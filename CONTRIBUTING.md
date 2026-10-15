# Contributing

## Setup

```sh
pnpm install
pnpm dev            # Chrome with hot reload
pnpm dev:firefox
```

Node 22+ and pnpm 10.

## Checks

```sh
pnpm typecheck && pnpm lint && pnpm test   # unit tests (Vitest)
pnpm build && pnpm e2e                      # end-to-end (Playwright, loads the built extension)
```

E2E tests serve local captures at the real site URLs and block every other request, so they never touch the network.

## Rules

- Read `AGENTS.md`. It applies to people too: no copied code from closed-source tools, no invented facts (cite endpoints, limits and selectors in `docs/provider-notes.md`), no placeholders in shipped code.
- Every user-visible string goes through `src/public/_locales`. New keys are `snake_case` with a module prefix.
- Reused open-source code is recorded in `THIRD_PARTY_NOTICES.md`. GPL/AGPL code is not used.
- Adding a site: see `docs/adding-a-site.md`.

## Translations

Copy `src/public/_locales/en/messages.json` to `src/public/_locales/<lang>/messages.json` and translate the `message` values. Keep the placeholders (`$NAME$`). Open a pull request.
