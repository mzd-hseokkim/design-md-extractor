---
name: design-md-extractor
description: Generate a production-grade DESIGN.md design-system document from a live website URL. Use this skill whenever the user gives a URL (or a few URLs/routes of one site) and wants to extract its design language — colors, typography, spacing, components, atmosphere — into a DESIGN.md file that an AI coding agent can read to reproduce matching UI. Trigger on phrases like "make a design.md from this site", "extract the design system of <url>", "turn this website into a design spec for my coding agent", "reverse-engineer this site's UI tokens", or any request to capture how a website looks into a reusable markdown design document. The skill runs a deterministic browser-based token extractor first, then writes the interpretive prose sections itself. It can also generate a faithful `preview.html` swatch sheet to visually verify a DESIGN.md (or tokens.json) against the original site — trigger that on requests like "show me a preview of this design.md", "visualize the design tokens", or "make an HTML preview of the design system".
---

# DESIGN.md Extractor

Turn a live website into a `DESIGN.md` — a plain-markdown design-system document (the format introduced by Google Stitch) that coding agents read to generate UI matching the site's look and feel.

## The core idea: two halves, two methods

A good DESIGN.md has two kinds of content that must be produced two different ways. **Do not blur them.**

1. **Deterministic tokens** — colors, type scale, spacing, radius, shadows, component measurements. These are FACTS read off the rendered page. They come from the extractor script (`scripts/extract.js`), never from guessing. You must never invent a hex value or a font size.

2. **Interpretive prose** — atmosphere, design philosophy, "the gradient mesh IS the depth system", do's and don'ts, font-substitution advice, role naming. This is YOUR job. You write it by reasoning over the extracted tokens AND the screenshots. The script cannot produce this.

The failure mode to avoid: hallucinating tokens (making up colors) OR producing flat prose that just restates numbers. Tokens must be exact; prose must add judgment the numbers alone don't carry.

## Workflow

### Step 1 — Confirm scope and run the extractor

You need the URL. If the user gave one URL, that's fine. If the site has distinct surfaces worth capturing (marketing home, pricing, dashboard/app, docs), ask once whether to sample a few routes — multi-route sampling produces a much richer token set. Don't over-ask; one clarifying question maximum.

Then run the extractor. **First-time setup in the user's environment** may need Playwright + a browser:

```bash
cd <skill-dir>/scripts
npm install playwright            # if not already present
npx playwright install chromium   # downloads the browser binary
```

If `npx playwright install chromium` fails (locked-down network, proxy, closed network / 폐쇄망), fall back to a browser already on the machine:

```bash
node extract.js <url> --channel chrome      # use installed Google Chrome
node extract.js <url> --channel msedge      # or Edge
node extract.js <url> --executable "/path/to/chrome"   # explicit path
```

Standard run:

```bash
node extract.js https://example.com \
  --routes /,/pricing,/dashboard \
  --out ./design-md-out
```

The script writes `tokens.json` (aggregated), `raw-samples.json` (debug), and `screenshot-<route>.png` per route into `--out`. It prints a JSON summary. If it exits non-zero, read the stderr tip — it tells you whether the problem is install, launch, or navigation.

### Step 2 — Read the evidence

Read `tokens.json` fully. Then **look at the screenshots** — they are essential, not optional. The screenshots tell you things tokens can't: is there a gradient mesh? Is photography full-bleed? Is the layout dense or airy? Does the dashboard flip to dark? Atmosphere lives in the pixels.

Cross-check the two. If `tokens.json` shows a saturated color appearing as a button background, and the screenshot confirms it's the one filled CTA, that's your `primary` accent. If a color has huge `bgWeight`, it's a surface, not an accent.

Read `references/token-mapping.md` for how to turn raw `surface-candidate` / `text-candidate` / `hairline-candidate` entries into named semantic roles (primary, ink, canvas, hairline, etc.), and how to derive the type-scale token names.

### Step 3 — Write DESIGN.md

Follow the exact structure in `references/design-md-template.md`. It is the canonical 9-section format with the YAML frontmatter token block. Fill the frontmatter from `tokens.json` (exact values), and write the prose sections by reasoning over tokens + screenshots.

Hard rules while writing:

- **Never fabricate a token.** Every hex, px, and weight in the frontmatter must trace to `tokens.json`. If the extractor didn't capture something (e.g. semantic error/success colors often aren't on marketing pages), say so explicitly rather than inventing it — e.g. "The marketing surface exposes no dedicated semantic palette."
- **Name colors semantically**, not by hue alone. `#0d253d` used for all body text → "Ink". `#533afd` on the one filled button → "Primary / Indigo". Use the screenshot to assign roles.
- **Round the type scale into named tiers** (display-xxl, display-xl, … body-md, caption, micro). Map raw sizes to tiers using `references/token-mapping.md`. Preserve exact letterSpacing and fontFeatureSettings — those micro-details (negative tracking, `tnum`, `ss01`) are the brand's signature and the highest-value output.
- **Reference tokens by name in prose**, e.g. write `{colors.primary}` and `{typography.display-xxl}` so the document is self-referential and an agent can resolve them.
- **Proprietary fonts**: if the primary family is licensed (Söhne, Circular, GT America, SF Pro, Geist when self-hosted, etc.), add a substitution note recommending the closest open-source analogue (commonly Inter, with the captured weight + letter-spacing) so an agent without the license can still approximate the rhythm.
- **Atmosphere section must earn its place.** "Key Characteristics" bullets should state things a screenshot reveals and a token list doesn't — gradient backdrops, single-CTA hierarchy, polarity flips, photography treatment.

### Step 4 — Output

Write the final `DESIGN.md` to the user's project root (or wherever they ask). When done, tell the user how to use it: drop `DESIGN.md` in the project root and instruct the coding agent to follow it for UI work.

### Step 5 — Visual preview (verification)

Generate a `preview.html` so the user can eyeball the captured tokens against the real site. This is a **verification** artifact, not a design showcase — run it whenever a DESIGN.md or tokens.json exists and the user wants to check fidelity (or proactively offer it after writing a DESIGN.md).

```bash
node scripts/preview.js path/to/DESIGN.md --out preview.html --screenshots ./design-md-out
# or straight from raw tokens:
node scripts/preview.js ./design-md-out/tokens.json --out preview.html --screenshots ./design-md-out
```

The script is fully deterministic (no LLM, no browser needed to *generate* it). It accepts **either** a `DESIGN.md` (parses the YAML frontmatter) **or** the extractor's `tokens.json`. It renders:
- color swatches with exact hex labels,
- a type ladder rendered in each tier's **captured family / weight / letter-spacing / OpenType feature** (so negative tracking, `ss01`, `tnum` are visible),
- radius and spacing scales as visual boxes,
- buttons / inputs / cards rendered to their measured spec, with `{colors.*}` / `{rounded.*}` token references auto-resolved,
- the captured screenshot(s) embedded inline (base64) for direct side-by-side comparison,
- a light/dark theme toggle.

**Design principle for the preview:** the page chrome is deliberately neutral and restrained (monospace, muted panels). Do NOT make the preview itself stylish — its job is to let the *tokens* stand out so discrepancies vs. the original are obvious. If you ever hand-edit the preview, keep the chrome quiet. The output is a single self-contained HTML file (screenshots inlined), so the user can open or share it directly.

If a token group renders empty in the preview (e.g. "No components captured"), that's a signal the extraction was thin for that group — consider re-running the extractor on a richer route.

## Quality bar

Compare your output mentally against a reference like getdesign.md entries. A weak DESIGN.md is a flat list of hex codes. A strong one: exact tokens + semantic role names + a type scale with preserved micro-tracking + 5–7 atmosphere bullets that capture what makes the brand recognizable + font-substitution guidance + do's/don'ts that act as guardrails. Aim for the strong version every time.

## Notes on robustness

- **Cookie/consent banners** are auto-dismissed by the script before sampling, but if a screenshot still shows one dominating, note that the captured colors may be skewed and re-run on an inner route.
- **Heavily-animated or canvas/WebGL sites** (some hero sections) won't expose tokens via computed style for the canvas itself — lean harder on the screenshot for those areas and say so.
- **Auth-walled pages** can't be reached; only sample public routes. Never attempt to log in or bypass anything.
- The script samples roughly the upper region of each page (where brand identity concentrates) to keep colors representative rather than averaging in long footers.
