# design-md-marketplace

A Claude Code [plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugins) containing the **design-md-extractor** plugin. The plugin bundles two skills: one that turns any live website into a production-grade `DESIGN.md` design-system document, and one that renders a deterministic `preview.html` to verify the captured tokens against the original site.

## Install

Add this marketplace from GitHub, then install the plugin:

```bash
/plugin marketplace add mzd-hseokkim/design-md-extractor
/plugin install design-md-extractor@design-md-marketplace
```

> Already added it? Pull the latest with `/plugin marketplace update design-md-marketplace`.

To work from a local clone instead, point at the checkout directory:

```bash
/plugin marketplace add /path/to/design-md-extractor
```

Once installed, just ask Claude:

> Make a DESIGN.md from https://linear.app

## Layout

```
design.md-plugin/                          # marketplace root
├── .claude-plugin/
│   └── marketplace.json                   # marketplace manifest
└── design-md-extractor/                   # plugin root
    ├── .claude-plugin/
    │   └── plugin.json                    # plugin manifest
    └── skills/                            # auto-discovered skills
        ├── design-md-extractor/           # skill 1 — extract DESIGN.md
        │   ├── SKILL.md
        │   ├── README.md
        │   ├── scripts/                   # extract.js
        │   └── references/                # token-mapping.md, design-md-template.md
        └── design-md-preview/             # skill 2 — render preview.html
            ├── SKILL.md
            └── scripts/                   # preview.js
```

## Skills

| Skill | Description |
| --- | --- |
| `design-md-extractor` | Extract a site's design language (colors, type, spacing, components, atmosphere) into a `DESIGN.md` an AI coding agent can read. |
| `design-md-preview` | Render a `DESIGN.md` (or `tokens.json`) into a deterministic, self-contained `preview.html` swatch sheet to verify fidelity against the original site. |
