# Token Mapping Guide

How to turn the raw output in `tokens.json` into the named, semantic tokens that go in the DESIGN.md frontmatter. The extractor gives you ranked *candidates*; you assign *meaning* using the candidate weights plus the screenshot.

## Colors

`tokens.json` groups colors into three ranked lists: `surfaces` (high `bgWeight`), `text` (high `fgWeight`), `borders` (high `borderWeight`). Assign roles like this:

### Surfaces → canvas / surface tokens
- The #1 surface by `bgWeight` is almost always the page background → name it `canvas` (light sites) or `canvas` as a near-black/dark value (dark sites).
- The #2–3 surfaces are usually section/card fills → `canvas-soft`, `surface`, `surface-raised`. Tiny tonal shifts from canvas (e.g. `#ffffff` → `#f6f9fc`) are intentional — keep them; they carry the brand's quiet layering.
- A warm or off-hue surface (cream, beige) appearing in mid-page bands → `canvas-cream` or similar; call out the "chromatic interlude" in prose.

### Accents → primary / brand
- A *saturated* color that shows up in `surfaces` with modest `bgWeight` BUT appears as a **button background** in `components.buttons` is the **`primary` accent**, not a surface. The button evidence is decisive. Cross-check the screenshot: the single filled CTA color = primary.
- Darker/lighter variants of that hue → `primary-deep`, `primary-press` (pressed state), `primary-soft`, `primary-subtle` (pale fill).
- Secondary saturated colors that appear only in gradients/illustrations and NEVER on buttons → name them as accents (`accent-ruby`, `accent-magenta`) and explicitly note in prose that they are decorative, not interactive.

### Text → ink tokens
- #1 text color → `ink` (primary body text). Note if it's a near-black tinted color (e.g. deep navy `#0d253d`) rather than pure black — that's a deliberate brand choice worth stating.
- Lower-weight text colors → `ink-secondary`, `ink-muted` (captions/helper). 
- White/near-white text that appears over dark or accent surfaces → `on-primary` / `on-dark`.

### Borders → hairline tokens
- Top border candidate → `hairline` (1px card/table separators).
- A second, cooler/different border color often used on inputs → `hairline-input`.

### What to do about missing colors
Marketing pages frequently expose **no semantic state palette** (success/error/warning) because those live inside the product UI. Do NOT invent them. Write: "No dedicated semantic palette is exposed on the sampled surfaces; state colors live in product UI."

## Typography

`tokens.json.typography.scale` is an array sorted largest→smallest, each with `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `fontFeatureSettings`, `prominence`. Map sizes to named tiers. Use this rough rubric (adjust to the actual sizes present — don't force tiers that don't exist):

| Tier name        | Typical px range | Role                         |
|------------------|------------------|------------------------------|
| `display-xxl`    | 48–72            | Hero headline                |
| `display-xl`     | 36–48            | Section opener               |
| `display-lg`     | 28–36            | Card title / sub-section     |
| `display-md`     | 24–28            | Compact title                |
| `heading-lg`     | 20–24            | Sub-heading                  |
| `heading-md`     | 18–20            | Minor heading                |
| `body-lg`        | 16–18            | Lead paragraph               |
| `body-md`        | 14–16            | Default body                 |
| `caption`        | 12–14            | Helper, labels               |
| `micro`          | 10–12            | Fine print, eyebrows         |
| `button-md/sm`   | (from buttons)   | Pull from `components.buttons` fontSize/fontWeight |

Rules:
- **Preserve `letterSpacing` and `fontFeatureSettings` exactly.** Negative tracking on display sizes, `tnum` on numeric/caption sizes, `ss01` globally — these micro-details are the single highest-signal part of the output. Never round them away.
- Convert px `lineHeight` to a unitless ratio when it's clearly derived (e.g. `57.68px` at `56px` → `1.03`) for readability, but it's fine to keep px if uncertain.
- The `prominence` field (accumulated rendered area) helps you decide which size is the true hero vs. an incidental large element. Highest prominence among large sizes = display-xxl.
- If two adjacent captured sizes are within ~1px and share weight, merge them into one tier.

### Font family
- `typography.families` is ranked by usage count. The #1 family (excluding monospace) is the brand UI/display face. A monospace family that appears = code/tabular face; name it and note its use.
- Strip the fallback stack to the **primary** family for naming, but keep the full stack in the frontmatter `fontFamily` value.
- If the primary is a known proprietary face, add a substitution note (see SKILL.md). Common proprietary→open-source analogues: Söhne/GT America/Circular → **Inter**; SF Pro → **Inter** or system-ui; a geometric brand sans → **Geist** or **Inter**. Always carry over the captured weight + letter-spacing into the substitution advice.

## Spacing
`tokens.json.spacing` is a sorted, de-duplicated list of the most common padding/gap values. Map to a scale: `xxs, xs, sm, md, lg, xl, xxl, huge`. Identify the base unit (usually the smallest common step or its multiples — frequently 4px or 8px) and state it. Don't list every stray value; present the coherent scale.

## Radius
`tokens.json.radius` sorted ascending. Map to `xs, sm, md, lg, xl, pill`. A `9999px` (or very large) value = `pill`; flag it and note "pill buttons" in prose if buttons use it.

## Shadows / elevation
`tokens.json.shadows` ranked by frequency. Build an elevation ladder (Level 0 flat → Level 1 subtle card lift → Level 2 floating panel). Note the shadow *color* — brands often tint shadows with their ink/brand hue (e.g. `rgba(0,55,112,…)`) rather than neutral black; that's worth calling out.

## Components
`components.buttons`, `.inputs`, `.cards` carry measured samples. Use them to write the Components section with exact padding/radius/colors, and reference the named tokens you assigned above (e.g. background `{colors.primary}`, radius `{rounded.pill}`). Group buttons into primary / secondary / on-dark by their backgrounds.
