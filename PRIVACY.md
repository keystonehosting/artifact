# Privacy

Artifact keeps your chats on your device. It has no server, no account, no telemetry, and no analytics.

## Where your data is stored

- **Your browser** (IndexedDB and extension storage): conversations you open or import, the search index, folders, tags, bookmarks, highlights, notes, reminders, prompts, chains, files you attach to prompts, the prompts you sent (prompt history), unsent drafts, your profile text, the last 20 handoffs, and settings.
- **Files you import** (official exports, Takeout, Artifact archives) are read in the browser and never uploaded.
- **A folder you choose**, if you turn on auto-backup. If that folder is synced by Google Drive, OneDrive or Dropbox, those services receive the files under their own terms.

Uninstalling Artifact deletes its browser storage. Export first if you want to keep it.

## Every network destination

| Destination | When | What is sent |
|---|---|---|
| The AI sites you use (ChatGPT, Claude, Gemini, AI Studio, Grok, and Tier 2 sites you enable) | When you use Artifact on those sites | Requests the site's own web app would make, with your existing session: reading conversations, listing chats, downloading your files, and actions you confirm (delete, archive, rename). |
| File hosts of those sites (`*.oaiusercontent.com`, `*.googleusercontent.com`, `assets.grok.com`) | When an export includes files | Downloads your uploaded and generated files. |
| `alkalimakersuite-pa.clients6.google.com` | When you use Artifact on Google AI Studio | AI Studio's own API, called the way the AI Studio page calls it, to read your saved chats. |

That is the complete list for the current release. Later releases add two destinations, both off by default and listed here when they ship:

- an AI API you configure yourself, used only when you trigger a feature that needs it. Before the first send for each feature, Artifact shows exactly what will be sent. Emails, phone numbers, keys and tokens are redacted first by default.
- the opt-in rules pack: selectors and endpoint paths as signed JSON data from this repository's GitHub releases. It is data, never code.

## What diagnostics contain

The Self-test report contains versions, health states, check names, data sources and redacted URL shapes. It never contains message text, titles, cookies, tokens or API keys.
