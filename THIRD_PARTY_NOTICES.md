# Third-party notices

## ACE — AI Chat Exporter (MPL-2.0)

- Source: https://github.com/Covai-Labs/ace
- Pinned commit: `671dfc8103ad5081e04a0894bdda87b8b7ee181e` (version 1.22.0, 2026-10-14)
- Imported without history as this repository's first code commit (git tag `ace-import` locally; commit "Import ACE 1.22.0 source").
- License: Mozilla Public License 2.0 (the same license as Artifact; see `LICENSE`).

Files derived from ACE. Each carries an MPL header naming its ACE origin:

| Artifact file | ACE origin |
|---|---|
| `src/core/util/filename.ts` | `content/utils/filename.js` |
| `src/core/export/ace-helpers.ts` | `content/formatters/base.js`, `content/formatters/markdown.js` |
| `src/core/dom/composer.ts` | `content/transfer/injector.js`, `content/transfer/platform-inputs.js` |
| `src/adapters/selectors.ts` (composer selectors) | `content/transfer/platform-inputs.js` |
| `tests/fixtures/sites/*` | `tests/fixtures/*` (third-party page captures; see the README in that folder) |

ACE's site parsers live in the separate package `decant-core`, which is licensed AGPL-3.0-only. Artifact does not use or include `decant-core`; see `docs/decisions.md` (D1).

## Runtime dependencies (bundled)

| Package | License |
|---|---|
| preact | MIT |
| dexie | Apache-2.0 |
| minisearch | MIT |
| zod | MIT |
| gpt-tokenizer | MIT |
| dompurify | MPL-2.0 OR Apache-2.0 |
| fflate | MIT |
| katex | MIT |
| html2canvas-pro | MIT |

License texts ship inside each package in `node_modules` and are reproduced in the release `sources` zip.

## MIT-licensed code consulted or reused

| Project | License (confirmed) | Use |
|---|---|---|
| Loominary — https://github.com/Laumss/loominary @ `5ae077b5bc010d80289a851621514397cf95422b` | MIT, "Copyright (c) 2025 Yalums" | Site payload shapes (ChatGPT, Claude, Grok, AI Studio) for adapters and Zod schemas |
| Claude Counter — https://github.com/she-llac/claude-counter @ `18b18ebc4d3e59ca3f7912a7109b2f6a24ab1fb0` | MIT, "Copyright (c) 2025 Claude Counter contributors" | Claude usage endpoint and payload shape |

When a file is lifted from either project, it is listed here with its origin and keeps the MIT notice:

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Data

- **Starter prompts** (`src/core/prompts/starter-pack.json`): 44 prompts selected from `prompts.csv` in awesome-chatgpt-prompts (https://github.com/f/awesome-chatgpt-prompts) at commit `7a507e2afc6157f40295624b3e86596362e14368`. The repository's LICENSE (checked 2026-10-15) dedicates prompt content and data, including `prompts.csv`, to the public domain under CC0 1.0 Universal; its code is MIT and none of it is used. Artifact changed the trailing example request of 28 prompts into a `{{request}}` variable with that example as its default. Contributor handles are kept in the file.

## Ideas only (no code used)

- Gemini Voyager (https://github.com/Nagi-ovo/gemini-voyager): GPL-3.0. SPEC §1 listed it as "MIT (confirm)". The LICENSE file is GPL-3.0, so it is used for ideas only (D2).
- Lazy Chat++ (GPL), My Prompt (CC-BY-NC-ND), Superpower ChatGPT (closed), and the user's older userscripts: ideas only.
- AI Toolbox, YourAIScroll and My Prompt: clean-room behavior descriptions only, through `docs/dossier/`.
