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

- **Export the open chat** as Markdown (YAML frontmatter, LaTeX kept, Obsidian-friendly), plain text or JSON, from the toolbar popup or the page's right-click menu. Copy as Markdown.
- **Artifact archive format**: the JSON export follows [`schemas/artifact-archive-v1.json`](schemas/artifact-archive-v1.json). It holds the full branch tree, attachments and artifacts, plus ACE-compatible fields so tools that read ACE exports can read it too.
- **Site health**: each site reports Healthy, Degraded or Broken with the reason. A site change shows up as Degraded instead of producing wrong data.
- **Self-test and diagnostics**: runs every adapter check on the current page and produces a report you can paste into an issue. The report never contains message text, cookies, tokens or keys.

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
