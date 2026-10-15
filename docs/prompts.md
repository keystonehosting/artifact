# Prompt templates

Saved prompts and chain steps can ask for values when they are used. Everything between `{{` and `}}` is a placeholder; the rest is inserted as written.

| Write | Effect |
|---|---|
| `{{topic}}` | A text field labelled "topic". Asked once and printed everywhere `{{topic}}` appears. |
| `{{topic:renewable energy # one or two words}}` | The same, with a default answer and a hint under the field. |
| `{{tone\|formal\|*casual\|...}}` | One choice from a list. `*` marks the default. `...` adds an "Other" box for a free answer. |
| `{{+sections\|intro\|*body\|end}}` | Several choices, joined with ", ". `*` marks the ones ticked by default. |
| `{{!audience:experts}}` | Asked in the form, but printed only where the prompt writes `{{audience}}`. |
| `{{=lang:British English}}` | A fixed value, never asked and not printed here; `{{lang}}` elsewhere prints it. |
| `{{file:Reference}}` | A file picker; the chosen file is attached to the message. Nothing is printed. |
| `{{date}}`, `{{time}}`, `{{datetime}}` | Today's date (YYYY-MM-DD) and the time (HH:MM). |
| `{{selection}}` | The text selected on the page, for right-click prompts. Without it, the selection is added after the prompt. |
| `\{{` | A literal `{{`. |

An empty answer removes its placeholder, and the whole line when the placeholder was alone on it.

A prompt can also attach files from the Prompts tab's file library every time it is used, and can be set to send right after it is inserted (off unless you turn it on for that prompt).

## In the composer

- `//` then a few letters: pick a prompt.
- `..` then a few letters: run a chain. Each step is sent when the previous reply finishes, or waits for you if the step says so.
- `@@` then part of a title: insert another stored chat as context.
- Up and Down in an empty composer: earlier prompts you sent on this site.
- Ctrl/Cmd+Shift+Enter: queue the text to send after the current reply.

Text pasted with one of these triggers at the start never opens a list.

## Chains in one paste

In the chain editor, paste several steps separated by a line containing only `---`.
