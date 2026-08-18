# seros.dev — marketing site

Static HTML. No framework, no build step for the marketing pages. The legal pages are
generated from Markdown so the contracts have one source of truth.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Home page (hand-written) |
| `assets/styles.css` | The whole design system: palette, type scale, components |
| `assets/seros-hero.png` | Discobolus engraving, ink on transparent, derived from the brand art |
| `assets/og-image.jpg` | 1200x630 social card |
| `site.json` | Company facts + `draft` flag used to fill legal placeholders |
| `tools/build.py` | Renders `../legal/*.md` into themed HTML pages |
| `privacy.html`, `terms.html`, ... | **Generated. Do not edit by hand.** |

## Build the legal pages

```bash
python3 tools/build.py            # render
python3 tools/build.py --check    # report unresolved [[PLACEHOLDER]] tokens, write nothing
```

`site.json` drives substitution. While `"draft": true`:

* every generated page carries a visible draft banner,
* every generated page is `noindex`,
* unresolved placeholders are left visible instead of failing the build.

Set `"draft": false` only after counsel has reviewed the pack. The build then refuses to
run while any placeholder is unfilled.

## Design system

Palette and type come from the founder's brand board:

| Token | Hex | Use |
|---|---|---|
| `--seros` | `#0009AD` | Primary. Links, buttons, accents |
| `--ink` | `#283053` | Body text, headings, the engraving |
| `--steel` | `#608ACD` | Eyebrows, labels, rules |
| `--sky` | `#B8DAFF` | Washes, numerals |
| `--paper` | `#EDE7DE` | Page background |
| `--grey` | `#E8E8E9` | Secondary surfaces |

Headings are Georgia (serif). Body and labels are Courier New. Imagery is classical
black-and-white engraving on paper. No stock photography, no gradients-as-decoration,
no emoji.

## Deploy

Static hosting; `vercel.json` sets security headers and long-lived asset caching.
Point the apex domain at the host once `seros.dev` is registered — see
`../business/OPERATIONS-CHECKLIST.md`.

## Before this goes live

See `../SITE-TODO.md`. In short: register the domain, stand up the mailboxes referenced
on the pages, get the legal pack reviewed, then flip `draft` to false and rebuild.
