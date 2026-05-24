# design-md-marketplace

A Claude Code [plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugins) containing **design-md-extractor** — a skill that turns any live website into a production-grade `DESIGN.md` design-system document and renders a deterministic `preview.html` to verify the captured tokens against the original site.

## Install

Add this marketplace, then install the plugin:

```bash
# from a local clone
/plugin marketplace add /path/to/design.md-plugin

# or from a git/GitHub repo
/plugin marketplace add <owner>/<repo>
```

```bash
/plugin install design-md-extractor@design-md-marketplace
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
    └── skills/
        └── design-md-extractor/           # the skill (auto-discovered)
            ├── SKILL.md
            ├── README.md
            ├── scripts/                   # extract.js, preview.js
            └── references/                # token-mapping.md, design-md-template.md
```

## Plugins

| Plugin | Description |
| --- | --- |
| `design-md-extractor` | Extract a site's design language (colors, type, spacing, components, atmosphere) into a `DESIGN.md` an AI coding agent can read, plus a `preview.html` verification sheet. |
