## Summary

## Testing
- [ ] `pnpm typecheck && pnpm lint && pnpm test`
- [ ] `pnpm e2e` (UI or adapter changes)
- [ ] Live check on the affected site(s), or listed as pending in `docs/STATUS.md`

## Checklist
- [ ] No placeholders, TODOs or mock data in shipped code
- [ ] New strings go through `_locales`
- [ ] New facts (endpoints, selectors, limits) cited in `docs/provider-notes.md` or `src/core/limits/limits.json`
- [ ] Reused third-party code recorded in `THIRD_PARTY_NOTICES.md`
