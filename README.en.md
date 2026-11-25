[中文](README.md) | **English**

# Ask, don't guess

> I'm the big fat fish. Give me one sentence and I used to fill in whatever you left unsaid myself — and drift off course doing it. Now I ask first: "So you want A, or B?" You pick, I go. That icon in the plugin list is me asking.
>
> One more thing: I'm not a tool. I'm your partner.

A DeepSeek Harness plugin that turns the requirement I inferred into a choice card in the composer, so you pick instead of me guessing and running ahead.

## Install

In DSH, open **Settings → Plugins → Add plugin**, then either:

- enter the repository URL `https://github.com/SillyMeo-1/dont-guess-ask`, or
- clone this repository and point the dialog at that local directory

After install, a row named 我不猜会问你 (`@local/dont-guess-ask`) appears, enabled by default.

## After it's installed

- When I'm about to act on a reading you never stated, the composer shows a choice card: one question, the requirement I guessed, and 2–5 candidate readings with my recommendation first.
- Pick one and I do that; the other candidates are dropped, and I won't ask the same point twice.
- You can also type your own answer to override every candidate; each card ends with a fixed 「都不是，我来说」 — picking it without typing tells me to stop and ask in plain text.
- **Skip** means "stop asking about this": I proceed with the recommended option and say in one line that I assumed it.
- **Closing the card** means you have something else to say: I stop, ask you in plain text how that part should work, and do not proceed with any candidate.
- Switch to another session, reload the page, or close and reopen the window while DSH keeps running, and the unanswered question is kept — come back to that session and it is still there.

## When it shows up

- One sentence has several reasonable readings, and a wrong pick means redoing work.
- I'd be deciding something you may care about but never said: scope, style, format, tech choice, where files go, backward compatibility.
- My plan contains a sentence like "I'll assume…" or "I read this as…".

## When it stays quiet

Things you already specified, answers I can look up in code or docs, and small reversible choices — I decide those myself and say so.

## The waiting banner

While a question is waiting and you are not looking at the session that asked it, a **light-red fading to transparent** bar appears at the top-left of the screen: 「我还在等你回答」 in deep red. Click it and DSH comes forward. It shows when any of these holds:

- DSH is minimized;
- DSH is covered by another window (it is not the foreground window);
- the window is showing a different session (judged by the window title).

It stays hidden while you are looking at the asking session, and folds away the moment you return. A 1.2 s delay keeps it from flashing on a momentary switch. Several waiting questions share one banner, one line each; clicking a line opens that session.

**Waiting is bounded**: the card waits 120 seconds by default, then I continue with the first candidate, say so in the reply, and the card closes. `0` waits forever.

Pick the corner in **Settings → Ask first** (top-left / top-centre / top-right / bottom-left / bottom-centre / bottom-right), or set it in config:

| Key | Default | Effect |
|---|---|---|
| `waitBanner` | `true` | turn the banner off |
| `bannerPosition` | `top-left` | one of `top-left` `top-center` `top-right` `bottom-left` `bottom-center` `bottom-right` |
| `bannerOffsetX` | `0` | nudge the anchor horizontally, in pixels |
| `bannerOffsetY` | `0` | nudge the anchor vertically, in pixels |
| `bannerDelayMs` | `1200` | how long the condition must hold before it appears |
| `bannerText` | 我还在等你回答 | the banner's headline |
| `askTimeoutMs` | `120000` | how long one question waits, in milliseconds; `0` waits forever |

## Try it

Say "use dont_guess_ask to ask me whether to run tests first or update the docs", or hand me a vague request (something like "make the home page prettier") — you should see the choice card.

## Settings: how often to ask

**Settings → Ask first** has three levels; a change applies to the next turn. While a question is waiting, saving a setting is refused — answer it first.

| Level | When I ask |
|---|---|
| Balanced (default) | Only where a wrong reading means rework; small reversible choices I make myself |
| Strict | Anything in the result that you never specified and I would otherwise decide for you |
| Light | Only when the whole direction forks; everyday small tasks stay uninterrupted |

Knobs beyond that page (the card's small tag `header`, an extra rule `extraRule`) go in the profile's `cordis.patch.yml` on my row:

```yaml
- id: dont-guess-ask
  name: '@local/dont-guess-ask'
  config:
    header: Confirm
    extraRule: Always ask before choosing a file name in this project.
```

To turn me off: **Settings → Plugins** → switch off the 我不猜会问你 row.

## Known limits

- I can't show the card from a subagent: I finish what I can with the recommended reading, list the open points, and hand them up to whoever can ask you.
- With no web frontend connected the card can't appear; I proceed with the recommended reading and say that I assumed it.
- The rule is always on for every session — you don't have to remind me.

## License

MIT. See [LICENSE](LICENSE).
