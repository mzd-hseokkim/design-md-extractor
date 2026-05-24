# DESIGN.md Canonical Template

This is the structure every generated DESIGN.md must follow. The format is: a YAML frontmatter block holding the deterministic tokens, then 9 prose sections. Fill `< >` placeholders. Tokens come from `tokens.json` (exact); prose comes from your reasoning over tokens + screenshots.

Token references inside prose use `{group.name}` syntax (e.g. `{colors.primary}`, `{typography.display-xxl}`, `{rounded.pill}`) so the document is self-resolving for a coding agent.

---

```markdown
---
version: alpha
name: <Brand>-inspired-design-analysis
description: <2–4 sentence dense summary of the design language — the dominant surfaces, the signature accent, the type treatment, the one or two things that make it instantly recognizable.>

colors:
  primary: "#______"          # the one filled-CTA accent
  primary-deep: "#______"     # (if present) darker variant / gradient mid-stop
  primary-press: "#______"    # (if present) pressed state
  primary-soft: "#______"     # (if present) lighter UI accent
  ink: "#______"              # primary body text
  ink-secondary: "#______"
  ink-muted: "#______"
  on-primary: "#______"       # text on accent/dark surfaces
  canvas: "#______"           # page background
  canvas-soft: "#______"      # section/card fill
  hairline: "#______"         # 1px separators
  # add accent-* for decorative-only colors; omit roles that genuinely don't exist

typography:
  # one block per named tier that actually exists on the site
  display-xxl:
    fontFamily: "<full stack>"
    fontSize: __px
    fontWeight: ___
    lineHeight: ___
    letterSpacing: ___px        # PRESERVE EXACTLY
    fontFeature: <ss01 / tnum / null>
  body-md:
    fontFamily: "<full stack>"
    fontSize: __px
    fontWeight: ___
    lineHeight: ___
    letterSpacing: ___
    fontFeature: <…>
  # … the rest of the tiers

rounded:
  xs: __px
  sm: __px
  md: __px
  lg: __px
  pill: 9999px       # only if present

spacing:
  xs: __px
  sm: __px
  md: __px
  lg: __px
  xl: __px
  xxl: __px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: __px __px
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: __px __px
  card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: __px
  # … other captured components
---

## Overview

<2–4 paragraphs. Describe the page's visual story: what fills the top, what the eye lands on, how surfaces layer, where the accent appears and how sparingly, what the type does. Reference tokens by name. This is where atmosphere from the screenshots becomes words.>

**Key Characteristics:**
- <5–7 bullets, each naming something recognizable that a token list alone wouldn't reveal: gradient backdrops, single-CTA hierarchy, polarity flips to dark, photography treatment, signature tracking, etc.>

## Colors

> **Source pages:** <routes sampled>

### Brand & Accent
- **<Name>** (`{colors.primary}` — `#______`): <role, where it appears>
- …

### Surface
- **Canvas** (`{colors.canvas}` — `#______`): <role>
- …

### Text
- **Ink** (`{colors.ink}` — `#______`): <note if tinted near-black rather than pure black>
- …

### Semantic
<State whether a semantic palette exists on the sampled surfaces. If not, say so — do not invent.>

## Typography

### Font Family
<Primary family, its character, weights used. Note proprietary status + open-source substitution advice with carried-over weight/tracking.>

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xxl}` | __px | ___ | ___ | ___px | <use> |
| … | | | | | |

### Principles
- <The brand's typographic rules: which weight is "the brand", where negative tracking applies, where tabular figures appear, global font-features.>

## Layout

### Spacing System
- **Base unit**: __px. Tokens: <list the scale>.
- **Section padding / card padding**: <from samples>.

### Grid & Container
<Container width, column behavior, how the grid collapses if observable.>

### Whitespace Philosophy
<Dense vs airy; where it tightens (pricing/dashboard) vs breathes (marketing).>

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat | Default surface |
| 1 | `<shadow value>` | Card lift |
| 2 | `<shadow value>` | Floating panel |

<Note shadow tint (brand-hued vs neutral). If the brand's depth is carried by gradients/imagery rather than shadows, say that explicitly.>

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | __px | <use> |
| … | | |

### Photography / Imagery Geometry
<How images/mockups are treated: full-bleed, inset, framed in radius containers, shadowed or not. From the screenshot.>

## Components

### Buttons
**`button-primary`** — <dominant CTA>. Background `{colors.primary}`, text `{colors.on-primary}`, radius `{rounded.pill}`, padding `__ __`.
<secondary, on-dark variants as captured>

### Inputs
<from samples>

### Cards & Containers
<from samples, referencing tokens>

## Do's and Don'ts

**Do:**
- <guardrails that keep generated UI on-brand: use the single accent sparingly, keep display weight thin, etc.>

**Don't:**
- <anti-patterns: don't bold the display type, don't use the decorative accents as buttons, don't add shadows where the brand uses none, etc.>

## Responsive Behavior
<Breakpoints if observable, touch-target sizing, how nav/columns collapse, what reflows. If only one viewport was sampled, state that this is inferred and conservative.>

## Agent Prompt Guide

**Quick reference:** primary `#______` · ink `#______` · canvas `#______` · font `<primary>` · radius `<pill/lg>`.

**Ready-to-use prompt:**
> Build a <page type> using this design system: <one-paragraph distillation an agent can paste — the accent, the surfaces, the type face + weight + tracking, the button shape, the spacing rhythm, the one atmospheric signature>.
```
