# design-md-extractor

A Claude Code skill that turns a live website URL into a production-grade **DESIGN.md** — the plain-markdown design-system format (introduced by Google Stitch) that AI coding agents read to generate UI matching a site's look and feel.

## How it works

Two halves, produced two ways:

1. **Deterministic extraction** (`scripts/extract.js`) — a headless browser opens the page, reads `getComputedStyle()` on every visible element, and aggregates the results into ranked design tokens: colors (surface / text / border), a clustered type scale (with letter-spacing and OpenType features preserved), spacing, radius, shadow, and measured button/input/card samples. It also captures screenshots. This half is exact — no guessing.

2. **Interpretive prose** (Claude, guided by `SKILL.md`) — Claude reads `tokens.json` and the screenshots, assigns semantic role names (primary, ink, canvas, hairline…), maps raw sizes to named type tiers, and writes the 9 prose sections: Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's/Don'ts, Responsive, Agent Prompt Guide.

The split matters: tokens are facts read off the page; prose is judgment the numbers alone don't carry.

## Install

This is a Claude Code skill. Place the folder where your skills live, then in Claude Code just ask:

> Make a DESIGN.md from https://linear.app

Claude will handle browser setup and run the extractor. First run may need:

```bash
cd scripts
npm install
npx playwright install chromium
```

### Closed network / no browser download
If `playwright install` is blocked, point the extractor at a browser already on the machine:

```bash
node scripts/extract.js https://example.com --channel chrome
node scripts/extract.js https://example.com --executable "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Manual use (without the skill)

```bash
node scripts/extract.js https://stripe.com --routes /,/pricing --out ./out
# → out/tokens.json, out/raw-samples.json, out/screenshot-*.png
```

Then hand `tokens.json` + the screenshots to Claude with the instruction to write a DESIGN.md per `references/design-md-template.md`.

## Visual preview / verification

Render any `DESIGN.md` (or raw `tokens.json`) into a self-contained `preview.html` swatch sheet to check fidelity against the original site:

```bash
node scripts/preview.js ./DESIGN.md --out preview.html --screenshots ./out
```

It shows color chips (exact hex), a type ladder rendered in each tier's real family/weight/tracking (so `ss01`, `tnum`, and negative letter-spacing are visible), radius + spacing scales, buttons/inputs/cards rendered to spec with `{token}` references resolved, and the captured screenshots inlined for side-by-side comparison — plus a light/dark toggle. Fully deterministic, no LLM. The preview chrome is intentionally neutral so the *tokens* stand out.

## Files

```
design-md-extractor/
├── SKILL.md                          # workflow + rules Claude follows
├── README.md
├── scripts/
│   ├── extract.js                    # the deterministic token extractor
│   ├── preview.js                    # deterministic preview.html generator
│   └── package.json
└── references/
    ├── token-mapping.md              # raw candidates → semantic token names
    └── design-md-template.md         # canonical 9-section DESIGN.md structure
```

## Limitations

- Auth-walled pages can't be sampled; public routes only.
- Canvas/WebGL hero sections don't expose tokens via computed style — the screenshot covers those.
- Proprietary fonts are named, with an open-source substitution suggested.
