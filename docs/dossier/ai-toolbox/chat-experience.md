# Chat experience (width, font, accent, RTL, collapsible messages, counter, finish alerts)

Strings: G-chat-exp, G-theme in [strings.md](strings.md). Observed in AIT 5.0.54, unconfirmed live. Unless stated, ChatGPT only.

## Theme and customization
- Accent color: 8 choices (blue default, green, purple, red, amber, teal, pink, indigo), each with light-mode and dark-mode shades plus a 8–14% tint, applied to AIT's own UI (not to the site). Available on all four sites (each with its own stored choice).
- Font size (ChatGPT): small, default, large, extra large = scale factors 0.875, 1, 1.125, 1.25 applied to the conversation text.
- Chat width ("wide mode", ChatGPT only): narrow 32rem, default (site default, no override), wide 60rem, full 100% of the column. Applied as a max-width override on the conversation column and the composer.
- Stored in localStorage and mirrored to the AIT server user profile (`/user/theme-customization`). **Artifact: local; width also on other Tier 1 sites (new work).**
- Premium: free users get 2 accent colors and no font/width control (skip).

## Text direction (RTL/LTR) switch
- A button injected next to the composer actions toggles a stored direction (ltr/rtl). Applying it sets `direction` on the composer (`#prompt-textarea`) and on the conversation's Markdown container (`div.h-full > section > main` or `… > section`, then `.markdown.prose`), and swaps classes on KaTeX elements (`span.katex`, `.katex-display`) so formulas keep LTR layout inside RTL text.
- Separate from AIT's own UI language direction (Arabic and Hebrew locales render AIT panels RTL).

## Collapsible messages
- Each message gets a collapse/expand toggle; a global "collapse all / expand all" in the menu and via Cmd/Ctrl+Shift+E. Toast confirms.
- State in localStorage: list of collapsed message IDs, a collapse-all flag, and a list of exceptions (messages expanded while collapse-all is on).
- Message anchors: `section[data-testid^="conversation-turn"]` with `[data-message-id]`; re-applied by a MutationObserver as turns render.
- Premium: free users can collapse 5 messages (skip).

## Word / character / token counter (the writing stats panel)
- A line under the composer (`form[data-type="unified-composer"]`, editor `.ProseMirror`): characters / words / sentences of the current draft. Placement flips left/right with the UI direction.
- Expandable analytics panel: estimated tokens (characters ÷ 4 + CJK ÷ 1.5, rounded up), reading time at 200 words per minute, speaking time at 130 words per minute (shown in min/hr), paragraphs (blocks separated by blank lines, at least 1), and three platform-limit bars: X/Twitter 280, LinkedIn 3,000, Instagram 2,200 characters, colored ok / warning above 80% / over.
- Sentences count runs of `.`, `!`, `?` and their Arabic and CJK equivalents. Words = whitespace-separated tokens.
- Setting the writing stats panel (default on).
- Premium: analytics panel paid (skip).

## Reply-finished alert
- Setting a reply-finished notification toggle (default off). When on and the tab is **hidden** at the moment ChatGPT's conversation POST completes (background `webRequest.onCompleted`), AIT plays the chosen sound and blinks the tab title: every 1 s it alternates between a notification title and the original title, restoring after 3 s.
- Sounds: 11 bundled clips (default the first, a chime) with a preview button and a volume slider (default 80%). The build must use its own sounds.
- There is **no** OS desktop notification (no `notifications` permission, no Notification API call), despite the upsell wording.
- Not available on Claude, Gemini or Grok.
- Premium: free users get 1 sound at fixed volume (skip).

## Other in-chat helpers present
- Per-message bookmark, label and voice controls (see their files).
- Copy of formulas or code is not added by AIT (sites already provide copy).

## Not in AIT
Speed mode / virtualization, timeline rail, auto-continue, session keep-alive, draft autosave, model switch, Mermaid rendering, branch tree/diff, privacy blur.
