---
name: design-md-preview
description: Render a DESIGN.md (or an extractor tokens.json) into a faithful, self-contained preview.html swatch sheet so the captured design tokens can be eyeballed against the original site. Use this skill whenever the user has a DESIGN.md or tokens.json and wants to SEE it — trigger on phrases like "show me a preview of this design.md", "visualize the design tokens", "make an HTML preview of the design system", "render this DESIGN.md so I can check it", or "verify these tokens against the original site". This is a deterministic verification artifact (no LLM, no browser needed to generate it), not a design showcase. It is the companion to the design-md-extractor skill, which produces the DESIGN.md in the first place.
---

# DESIGN.md Preview

Render a `DESIGN.md` (or the extractor's raw `tokens.json`) into a single self-contained `preview.html` swatch sheet, so the captured tokens can be checked **side-by-side against the original site**.

This is a **verification** artifact, not a design showcase. Its only job is to make discrepancies vs. the real site obvious. The companion skill `design-md-extractor` produces the `DESIGN.md`; this skill visualizes it.

## When to use

- Right after writing a `DESIGN.md` (proactively offer it), or
- Whenever the user asks to see / visualize / verify a `DESIGN.md` or `tokens.json`.

The input is **either** a `DESIGN.md` (the script parses its YAML frontmatter token block) **or** the extractor's `tokens.json`.

## How to run

The generator is pure Node (only `fs` + `path`) — no dependencies to install, no browser needed.

```bash
# from a DESIGN.md (parses the YAML frontmatter):
node scripts/preview.js path/to/DESIGN.md --out preview.html --screenshots ./design-md-out

# or straight from raw extractor tokens:
node scripts/preview.js ./design-md-out/tokens.json --out preview.html --screenshots ./design-md-out
```

Flags:
- `--out <file>` — output path (default `preview.html`).
- `--screenshots <dir>` — directory holding `screenshot-*.png` from the extractor; they get embedded inline (base64) for direct comparison.
- `--title "Brand"` — optional heading label.

Exit codes: `0` ok, `2` bad args, `5` parse failure.

## What it renders

- **Color swatches** with exact hex labels.
- **A type ladder** rendered in each tier's *captured* family / weight / letter-spacing / OpenType feature — so negative tracking, `ss01`, `tnum` are actually visible, not just described.
- **Radius and spacing scales** as visual boxes.
- **Buttons / inputs / cards** rendered to their measured spec, with `{colors.*}` / `{rounded.*}` token references auto-resolved.
- **The captured screenshot(s)** embedded inline for side-by-side comparison.
- A **light/dark theme toggle**.

The output is one self-contained HTML file (screenshots inlined as base64), so the user can open or share it directly.

## Design principle (do not violate)

The page chrome is deliberately **neutral and restrained** (monospace, muted panels). Do **not** make the preview itself stylish — its job is to let the *tokens* stand out so discrepancies vs. the original are obvious. If you ever hand-edit the generated HTML, keep the chrome quiet.

## Reading the result

If a token group renders empty (e.g. "No components captured"), that's a signal the extraction was thin for that group — tell the user, and suggest re-running `design-md-extractor` on a richer route.
