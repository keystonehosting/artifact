# Artifact — your open-source AI toolkit

Artifact is a browser extension that turns ChatGPT, Claude, Gemini, Google AI Studio and Grok into one organized, searchable, exportable workspace. It's free, has no account and no server, and is licensed under MPL-2.0.

> Artifact is an independent project. It is not affiliated with, endorsed by or sponsored by Anthropic, OpenAI, Google, xAI or any other AI provider. "Claude", "ChatGPT", "Gemini" and "Grok" are trademarks of their owners.

**Status:** pre-release. See [`CHANGELOG.md`](CHANGELOG.md) for what each release contains and [`docs/STATUS.md`](docs/STATUS.md) for what's in progress. Features are tested against captured pages in CI. Checks on the live sites are still pending and are listed in `docs/STATUS.md`.

## Install

Artifact isn't in the browser stores yet. Install a release build:

1. Download the zip for your browser from the [latest release](https://github.com/keystonehosting/artifact/releases): `artifact-<version>-chrome.zip`, `-edge.zip` or `-firefox.zip`.
2. **Chrome / Edge:** unzip it. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.
3. **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick the zip. Temporary add-ons are removed when Firefox restarts. A signed build will come with the store listing.

## Update

Download the newer zip, unzip it over the old folder, and click the reload icon on Artifact's card in `chrome://extensions`. Your data is stored in the browser profile, not the folder, so it is kept. Firefox: load the new zip the same way.

## Features

Shipped in the current release:

- **Reads chats the way the site does.** Artifact copies the conversation data the page already loads (ChatGPT, Claude, Gemini, AI Studio, Grok). Failing that, it uses the site's own endpoints with your session. Failing that, it falls back to the page text, labelled approximate. All edits and regenerations are kept as branches.
- **Context meter** above the composer, e.g. `82.4k / 200k · 41%`:
  - colors at 50/75/90% (editable), `≈ N exchanges left`, and live draft tokens;
  - a hover breakdown, the top-10 heaviest messages with jump-to, and a growth sparkline;
  - a token count when you hover any message;
  - warnings at 75% and 90% that you can snooze or mute.
  
  Counting uses the `o200k` tokenizer, exact for ChatGPT and estimated (≈) elsewhere. It is calibrated automatically on AI Studio, which reports its own count.
- **Context limits from published sources only** (`src/core/limits/limits.json`, each with its URL and date). When a limit isn't published, the meter says "unknown", and you can enter your own in Settings.
- **Plan usage:** Claude's 5-hour and weekly bars, Gemini's usage, and a ChatGPT widget that counts your sends against the caps you set, with an hourly heatmap.
- **Export the chat** as Markdown, text, JSON, HTML, Word (DOCX), PDF or PNG (1× or 2×):
  - **real uploaded files, generated images, Claude artifacts, created files and ChatGPT canvases are included as files** in a ZIP;
  - every artifact version is kept, and any file the site wouldn't serve is listed in `MISSING_FILES.txt`;
  - options: selected messages (Shift-click ranges), all branches, numbering, dates, table of contents, thinking, tool calls, file-name patterns, and Claude project instructions, knowledge files and memory.
- **Copy as Markdown, preview tab, Send to Obsidian**, the right-click menu, and keyboard shortcuts.
- **Your chats, organized across sites:** nested folders (also shown in each site's own sidebar), pinned chats, favorite assistants, tags with keyword-based Smart Tags, message labels and bookmarks, highlights on reply text, chat notes, and continue-later reminders. One-click import of projects as folders.
- **Search every chat on every site** with filters (site, role, model, dates, folder, tag, exact phrase, must-include / exclude), highlighted matches, jump-to-message, and a findings report. A deep scan stores your full history in the background; find-in-chat (Ctrl/Cmd+Shift+F) works on the open chat.
- **Privacy blur** (Alt+Shift+B) for screen sharing.
- **Side panel** with a dashboard, folders, search, library, export and settings.
- **Site health:** each site reports Healthy, Degraded or Broken with the reason. A site change shows up as Degraded instead of producing wrong data. **Self-test** produces a diagnostics report with no message text, cookies, tokens or keys.

The full plan is in [`docs/SPEC.md`](docs/SPEC.md).

## Privacy

Chat data stays in your browser. Artifact has no server, no telemetry and no analytics. The only network requests it makes go to the AI sites themselves, using your existing session. Every destination is listed in [`PRIVACY.md`](PRIVACY.md), and each permission is explained in [`docs/permissions.md`](docs/permissions.md).

## Troubleshooting

- **"Artifact isn't running on this tab yet":** reload the AI site's tab after installing or updating the extension.
- **"Read from page text (approximate)":** Artifact couldn't use the site's own data and fell back to the text rendered on the page. Long chats may not be fully rendered; scroll to load them, then export again.
- **The health dot is amber or red:** open the popup and run **Self-test**. Copy the report into a [bug report](https://github.com/keystonehosting/artifact/issues/new?template=bug_report.yml).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`docs/architecture.md`](docs/architecture.md) and [`docs/adding-a-site.md`](docs/adding-a-site.md). Translations are pull requests to `src/public/_locales/<lang>/messages.json`.

## License

[MPL-2.0](LICENSE). Artifact started from [ACE](https://github.com/Covai-Labs/ace) (MPL-2.0); see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
