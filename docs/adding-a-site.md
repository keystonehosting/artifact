# Adding a site

1. **Register it** in `src/core/sites/sites.ts` (id, name, tier, hosts, new-chat URL, match patterns) and in `src/core/sites/hosts.ts`. Tier 2 hosts are optional permissions.
2. **Write the DOM reader config**: a `DomReaderConfig` with the turn selector, a role function and the content element. Capture a page of the site, replace all text with lorem ipsum (the fixture recorder does this in dev builds), save it under `tests/fixtures/sites/`, and add a case to `tests/unit/dom-readers.test.ts`.
3. **Write the adapter** in `src/adapters/<site>/index.ts`, extending `BaseAdapter` with the URL parser and selectors. Add it to `src/adapters/registry.ts`.
4. **Structured data (optional, for Tier 1)**: add a Zod payload schema in `src/core/schema/payloads/<site>.ts` and implement `readStructured()`. Record every endpoint, field and selector in `docs/provider-notes.md` with its source and status.
5. **Capabilities**: set the flags for what the site supports. The UI hides the rest.
6. **E2E**: add the site to `SITE_FIXTURES` in `e2e/fixtures.ts`.

Promoting a site from Tier 2 to Tier 1 means implementing the remaining adapter methods. The core does not change.
