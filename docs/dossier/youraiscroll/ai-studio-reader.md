# YourAIScroll 1.9.9 — Google AI Studio reader

Observed in YourAIScroll 1.9.9, unconfirmed live. Confirms the seed fact: AI Studio is read through **MakerSuiteService** RPCs, not the DOM.

## Endpoint

- Host: `alkalimakersuite-pa.clients6.google.com`
- Service path prefix: `/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/`
- Methods used:
  - `ResolveDriveResource` — read one saved prompt / chat (AI Studio chats are Drive-backed "prompts").
  - `ListPrompts` — list the user's saved prompts.
- HTTP method: POST, `credentials: include` (Google cookies), request body is a JSON array (JSON+protobuf "jspb" encoding, positional fields).

## Authentication

All three headers below are computed in the content script on aistudio.google.com:

| Header | Value |
|---|---|
| `authorization` | `SAPISIDHASH <ts>_<sha1hex>` where `<ts>` is the current Unix time in seconds and the hash is SHA-1 (WebCrypto) of the string `<ts> <SAPISID> https://aistudio.google.com`. The SAPISID value is read from the first available cookie among `SAPISID`, `__Secure-3PAPISID`, `__Secure-1PAPISID`. No cookie → the user is told to sign in. |
| `content-type` | `application/json+protobuf` |
| `x-goog-authuser` | `0` (hardcoded: multi-account users signed into a non-default account index will read the wrong account) |
| `x-user-agent` | `grpc-web-javascript/0.1` |
| `x-goog-api-key` | only if found: the value under key `WIu0Nc` in any `script[type="application/json"]` on the page |

## Reading one chat — `ResolveDriveResource`

- **Prompt ID:** from the page path `/prompts/<id>` (letters, digits, `_`, `-`). No ID → a no-chat error error. `/prompts/new_chat` would be taken as an ID (and fail at the API).
- **Request body:** a one-element array containing the prompt ID.
- **Response fields read (positional):**
  - title: `[0][4][0]`
  - turns: `[0][13][0]` — array of chunks in order.
  - per chunk: text `[0]` (string), role `[8]` (`"user"` or `"model"`), thought flag `[19]` (`1` = thinking chunk).
- **Assembly rules:**
  - A `user` chunk closes any pending model text and becomes a user message (empty text skipped).
  - `model` chunks with the thought flag are **skipped** (thinking is never exported).
  - Consecutive non-thought `model` chunks are buffered and emitted as **one** assistant message, joined with blank lines.
  - Chunks with other roles (e.g. system instructions, function calls) are ignored. The run settings (model, temperature, system instruction) are not read.
- **Not handled:** inline images and uploaded files (Drive/inline data chunks without a text field are silently skipped), grounding/citations, code execution results, token counts. YourAIScroll reads no token-count fields at all, so whether and where the payload carries them (for Artifact's calibration idea in SPEC §6A) is unknown and needs live observation.
- **Conversation time:** none for single export (the header only has URL and export time).
- **Title fallback chain (DOM, for the filename):** `ms-toolbar h1`, then `ms-chunk-editor h1` / `.toolbar-left h1`, then the document title if it does not mention AI Studio or Google.

## Listing chats — `ListPrompts`

- **Request body:** an empty JSON array.
- **Response fields read:** `[0]` is the list; per entry: name at `[0]` in the form `prompts/<id>` (prefix stripped), title at `[4][0]`, timestamp at `[4][4][0]` as `[seconds, nanos]` (used for both created and modified).
- **Paging:** none implemented — whatever the first response contains is the whole list (`hasMore` is always false). Large libraries may be truncated; needs live confirmation of the page-token position.
- No starred/pinned information.

## Batch export

For each selected ID: `ResolveDriveResource`, then format (MD/TXT/JSON/HTML/DOCX), filename `AIStudio-<sanitised title>.<ext>`, canonical URL `https://aistudio.google.com/prompts/<id>`, ZIP `AIStudio-Batch-<date>.zip`. No delay between calls; the first failure aborts the batch.

## Error behaviour

HTTP errors are reported with a generic a generic retry message message (status not surfaced). There is no DOM fallback, so if the RPC shape changes the AI Studio exporter stops working entirely.

## Notes for Artifact

- The SAPISIDHASH scheme is a standard Google first-party web auth pattern; only send it to the Google host the page itself uses, from a content script on aistudio.google.com.
- Use `x-goog-authuser` from the page (account index) rather than hardcoding 0.
- Positional indices above are the only schema available; wrap them in a Zod schema and flip health to Degraded on mismatch (SPEC §4).
- Real-file export (SPEC §6F) will need the image/file chunk positions, which YourAIScroll does not read: a live-observation task.
