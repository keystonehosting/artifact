# Architecture

Artifact is a Manifest V3 extension built with WXT, TypeScript (strict) and Preact. One codebase builds Chrome, Edge and Firefox.

```
src/
  core/            site-agnostic logic, no DOM of any particular site
    schema/        archive schema (Zod) and per-site payload schemas
    model/         branch-tree operations
    dom/           HTML → message parts, composer filling
    export/        export formats and the export document model
    health/        health tracking and diagnostics
    sites/         site registry and host permissions
    messaging/     typed messages between contexts
    i18n/          message lookup through _locales
    util/          filenames and small helpers
  adapters/        one folder per site, implementing the adapter contract
  features/        feature modules, loaded on demand by the content script
  ui/              shared UI tokens and components
  entrypoints/     background, content script, popup (and later: side panel, options, offscreen)
  public/          _locales and icons, copied as-is
schemas/           published JSON Schema for the archive format
tests/unit/        Vitest
e2e/               Playwright against the built extension
```

## Contexts

- **Content script** (`entrypoints/content.ts`): matches the Tier 1 hosts and works out which site the page is. It then loads only that site's adapter (code-split) and answers typed messages (`core/messaging/protocol.ts`). Feature modules load on demand.
- **Background** (`entrypoints/background.ts`): context menus. Later milestones add indexing, queues, alarms and backups here.
- **Extension pages**: the popup, then the side panel and options. They do exports, because they have a DOM and can save files.

## The adapter contract

`src/adapters/types.ts` is SPEC §5 as a TypeScript interface. `BaseAdapter` (`src/adapters/base.ts`) implements the generic parts: DOM fallback reading, composer fill and submit, navigation and streaming detection, anchors, health and Self-test. A site adapter supplies:

- URL → chat id parsing;
- a `DomReaderConfig` (turn selector, role, content);
- composer, send, streaming and sidebar selectors;
- `readStructured()` for intercepted or endpoint data, validated by the site's Zod payload schema;
- whichever optional methods the site supports, with matching `capabilities` flags.

Data source order, recorded per read: (1) intercepted page data, (2) the site's endpoints with the user's session, (3) DOM text, marked approximate.

## Data model

`src/core/schema/archive.ts` defines the model: Conversation → messages keyed by id, forming a branch tree (`parentId`/`childIds`, `currentLeafId`) → Parts (text, code, math, tool call, citation, thinking, image, artifact reference) → Attachments and Artifacts. Exports, imports and backups all use it. The published JSON Schema is generated from the Zod schema, and a unit test keeps the two identical.

## Health

Each adapter owns a `HealthTracker`. Checks pass or fail with a reason. A failing check makes the site Degraded, and a failing critical check makes it Broken. A Zod validation failure is a failing check, so a site change is visible and never produces silently wrong data.
