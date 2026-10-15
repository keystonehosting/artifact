# Prompt chains (`..` trigger)

Strings: G-chains in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live.

## Purpose
Run a saved sequence of prompts one after another in the current chat, each step sent automatically after the previous reply finishes.

## Data
Chain: id, name (≤ 100), ordered steps (each a prompt text), optional per-step names ("step n name", shown trimmed to 22 characters), use count, last used.
- ChatGPT: up to 10 steps per chain; each step ≤ 10,000 characters.
- Claude, Gemini, Grok: up to 25 steps, each ≤ 6,000 characters; up to 100 stored chains.
- Storage: AIT server (`/chains/create`, `/chains/update` with `chainId` and `updatedFields` {name, prompts, labels}, `/chains/delete`, `/chains/get`, `/chains/use`), with the same device-only and cross-site sharing options as prompts ([prompts.md](prompts.md)). **Artifact: local.**

## Editor
- Fields: chain name; a list of steps, each with an optional name and a textarea; add step / remove step; drag handle to reorder (mouse drag with a dragging state); a counter "up to N steps". Tip: double-curly variables are entered once when the chain runs.
- On Claude/Gemini/Grok a hint string says steps are separated by a line containing only `---`, but the shipped editor uses one field per step and no `---` splitting logic exists in the build (stale hint). Artifact may implement paste-splitting as an improvement.
- Validation: name and at least one non-empty step required; max-chains error.
- Manage view lists chains with step counts; select mode for bulk delete; empty state with an empty-state call to create a chain; recently used chains (last 5).

## Starting a chain
- In the composer, type `..` at the start or after whitespace, followed by optional non-space characters to filter; the floating list shows chains (keyboard as for `//`). Or use "run" from the chains list.
- If any step contains `{{variables}}`, a dialog shows inputs grouped by step; values are substituted per step on submit.
- The first step is written into the composer **and sent** immediately (AIT clicks the site's send button, retrying via a DOM observer for up to 3 s). A progress bar appears.

## Advancing (per site)
- ChatGPT: the background reports when the site's conversation POST completes (`webRequest.onCompleted`). The content script then polls every 500 ms until the reply is idle: no visible stop button (`[data-testid="stop-button"]`, `button[aria-label="Stop"]`), the last `section[data-testid^="conversation-turn"]` contains a visible assistant message without `.result-streaming`, and the last turn differs from the one recorded when the step was sent. It needs 3 consecutive idle polls (10 when the page has no turns yet). Timeouts: 90 s with no generation activity, 30 minutes overall. After idle it waits 900 ms, inserts the next step, and if the composer still holds the step text it clicks send again up to 6 times, 700 ms apart. A 5-minute watchdog marks the chain timed out if no completion event arrives.
- Claude, Gemini, Grok: after sending, wait up to 12 s for generation to start (a stop button appears), then up to 300 s for it to end (stop button gone), then 450 ms before the next step. If generation never started and the composer still has text, the chain is marked timed out (retry offered). Send/stop buttons: Claude `button[aria-label="Send message" i]` (or aria-label containing send+message, or a submit button whose label contains send) and `button[aria-label="Stop response" i]` (or containing stop); Gemini `button.send-button` / a button containing `mat-icon[fonticon='send']`, and `button.stop-button` / `mat-icon[fonticon='stop']`; Grok `button[data-testid="grokSendButton"]` and other send-like test IDs or labels, and `button[data-testid="grokStopButton"]` / stop- or cancel-like labels.
- Stopping: the progress bar's stop button; on ChatGPT pressing the site's own stop (POST `/backend-api/stop_conversation`) also ends the chain. Navigating away ends it.

## Progress UI
A small fixed bar near the bottom of the page: chain name, "step i/n", optional step name, stop. On timeout it switches to a a timeout state state with retry (re-run the current step) and dismiss; on failure (composer not found, insert failed) a failure state.

## Edge cases
- Only one chain runs at a time; starting another replaces it.
- Each run increments the chain's use count and moves it to the top of a recent-items section.

## Premium (do not port)
Free: 2 chains.
