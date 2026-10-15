# Permissions

Why Artifact asks for each permission. Written so it can be pasted into store listing forms.

## Required

| Permission | Why |
|---|---|
| Host access to `chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com`, `aistudio.google.com`, `grok.com` | Runs Artifact's tools on these AI chat sites and reads your conversations with your existing session, so they can be exported, searched and organized. |
| Host access to `*.oaiusercontent.com`, `*.googleusercontent.com`, `assets.grok.com` | These hosts serve the files you uploaded and the images the sites generated. Artifact downloads them so exports contain the real files. |
| `storage`, `unlimitedStorage` | Keeps your settings, and your local library (folders, tags, bookmarks, the search index), on your device. Long chat histories exceed the default quota. |
| `downloads` | Saves exports (Markdown, JSON, ZIP...) to your Downloads folder. |
| `contextMenus` | Adds Artifact actions to the right-click menu on supported sites. |
| `alarms` | Schedules background work you turn on: auto-backup, indexing during idle time, and reminders. |
| `scripting` | Runs Artifact on a Tier 2 site after you turn that site on and grant access to it. |
| `sidePanel` (Chrome, Edge) | Artifact's home base opens in the browser side panel. Firefox uses its sidebar, which needs no permission. |
| `offscreen` (Chrome, Edge) | Runs the tokenizer in a background worker, so counting tokens never slows the page. |

## Optional (requested only when you turn the feature on)

| Permission | When | Why |
|---|---|---|
| Host access to `www.perplexity.ai`, `chat.deepseek.com`, `chat.mistral.ai`, `www.kimi.com`, `kimi.moonshot.cn`, `poe.com`, `copilot.microsoft.com`, `github.com/copilot/*`, `www.google.com/search*` | When you enable a Tier 2 site in Settings | Runs Artifact on that site. Only the sites you enable are granted. |

Artifact does not request `tabs`, `history`, `cookies`, `webRequest` or access to all sites.
