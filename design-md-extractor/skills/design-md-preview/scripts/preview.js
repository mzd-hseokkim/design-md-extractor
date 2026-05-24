#!/usr/bin/env node
/**
 * preview.js — Render a DESIGN.md (or tokens.json) into a faithful visual
 * swatch sheet (preview.html) for side-by-side verification against the
 * original site.
 *
 * This is a VERIFICATION tool, not a showcase. The page chrome stays neutral
 * and restrained; the swatches/type/components render the EXACT extracted
 * tokens so discrepancies vs. the real site are easy to spot. It supports a
 * light/dark toggle and embeds the captured screenshot(s) if present for
 * direct comparison.
 *
 * It is fully deterministic — no LLM. Input is the structured token data.
 *
 * Usage:
 *   node preview.js <DESIGN.md | tokens.json> [--out preview.html]
 *                   [--screenshots DIR] [--title "Brand"]
 *
 * Accepts either:
 *   - a DESIGN.md file (parses the YAML frontmatter token block), or
 *   - a tokens.json file (the extractor's aggregated output).
 *
 * Exit: 0 ok, 2 bad args, 5 parse failure.
 */

const fs = require("fs");
const path = require("path");

// ---------- args ----------
function parseArgs(argv) {
  const a = { input: null, out: null, screenshots: null, title: null };
  const r = argv.slice(2);
  for (let i = 0; i < r.length; i++) {
    if (r[i] === "--out") a.out = r[++i];
    else if (r[i] === "--screenshots") a.screenshots = r[++i];
    else if (r[i] === "--title") a.title = r[++i];
    else if (!r[i].startsWith("--") && !a.input) a.input = r[i];
  }
  return a;
}

// ---------- minimal YAML frontmatter parser (token blocks only) ----------
// We don't pull a YAML dependency (keep the skill dependency-light). The
// frontmatter we emit is regular: 2-space nested maps, "key: value" scalars,
// quoted strings, inline "# comments" (which the canonical template uses
// heavily), and "key: >" / "key: |" folded/literal block scalars (used for
// multi-line descriptions). This parser handles exactly that shape.

// Strip a trailing "# inline comment" without touching a "#" that is inside a
// quoted string (e.g. a hex value like "#0071e3") or glued to a token. A YAML
// comment must be preceded by whitespace (or start the line).
function stripInlineComment(s) {
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    else if (ch === "#" && !inS && !inD && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const lines = m[1].split("\n");
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^ */)[0].length;
    const line = stripInlineComment(raw).trim();
    if (!line) continue;
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const key = line.slice(0, ci).trim();
    let val = line.slice(ci + 1).trim();
    // pop to parent
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (val === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else if (/^[>|][+-]?$/.test(val)) {
      // block scalar — absorb the following more-indented lines as the value
      const folded = val[0] === ">";
      const buf = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (!next.trim()) { buf.push(""); i++; continue; }
        if (next.match(/^ */)[0].length <= indent) break;
        buf.push(next.trim());
        i++;
      }
      while (buf.length && buf[buf.length - 1] === "") buf.pop();
      parent[key] = folded ? buf.join(" ") : buf.join("\n");
    } else {
      val = val.replace(/^["']|["']$/g, "");
      parent[key] = val;
    }
  }
  return root;
}

// ---------- normalize either input shape into a common model ----------
function fromFrontmatter(fm) {
  const colors = fm.colors || {};
  const typography = fm.typography || {};
  const rounded = fm.rounded || {};
  const spacing = fm.spacing || {};
  const components = fm.components || {};
  // typography here is {tier: {fontFamily, fontSize, fontWeight, ...}}
  const typeScale = Object.entries(typography).map(([tier, t]) => ({
    tier,
    fontFamily: t.fontFamily || "",
    fontSize: t.fontSize || "",
    fontWeight: t.fontWeight || "400",
    lineHeight: t.lineHeight || "normal",
    letterSpacing: t.letterSpacing || "normal",
    fontFeature: t.fontFeature && t.fontFeature !== "null" ? t.fontFeature : null,
  })).sort((a, b) => parseFloat(b.fontSize) - parseFloat(a.fontSize));
  return {
    name: fm.name || "Design System",
    description: fm.description || "",
    colors, typeScale, rounded, spacing, components,
    source: "design.md",
  };
}

function fromTokensJson(t) {
  const colors = {};
  (t.colors?.surfaces || []).forEach((c, i) => { colors[i === 0 ? "canvas" : `surface-${i}`] = c.hex; });
  (t.colors?.text || []).forEach((c, i) => { colors[i === 0 ? "ink" : `ink-${i}`] = c.hex; });
  (t.colors?.borders || []).forEach((c, i) => { colors[i === 0 ? "hairline" : `hairline-${i}`] = c.hex; });
  const typeScale = (t.typography?.scale || []).map((s) => ({
    tier: `${s.fontSize}px`,
    fontFamily: s.fontFamily || (t.typography?.families?.[0]?.primary || ""),
    fontSize: `${s.fontSize}px`,
    fontWeight: s.fontWeight || "400",
    lineHeight: s.lineHeight || "normal",
    letterSpacing: s.letterSpacing || "normal",
    fontFeature: s.fontFeatureSettings || null,
  }));
  const rounded = {};
  (t.radius || []).forEach((r, i) => {
    const names = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "pill"];
    rounded[r.value === "9999px" ? "pill" : (names[i] || `r${i}`)] = r.value;
  });
  const spacing = {};
  (t.spacing || []).forEach((s, i) => {
    const names = ["xxs", "xs", "sm", "md", "lg", "xl", "xxl", "huge", "s8", "s9", "s10", "s11"];
    spacing[names[i] || `s${i}`] = s.value;
  });
  // components: synthesize from measured samples
  const components = {};
  (t.components?.buttons || []).slice(0, 4).forEach((b, i) => {
    components[`button-${i + 1}`] = {
      _kind: "button", _text: b.text || "Button",
      backgroundColor: b.backgroundColor, textColor: b.textColor,
      rounded: b.borderRadius, padding: b.padding,
      borderColor: b.borderColor, borderWidth: b.borderWidth,
      fontSize: b.fontSize, fontWeight: b.fontWeight,
    };
  });
  (t.components?.cards || []).slice(0, 3).forEach((c, i) => {
    components[`card-${i + 1}`] = {
      _kind: "card",
      backgroundColor: c.backgroundColor, rounded: c.borderRadius,
      padding: c.padding, boxShadow: c.boxShadow,
      borderColor: c.borderColor, borderWidth: c.borderWidth,
    };
  });
  (t.components?.inputs || []).slice(0, 2).forEach((inp, i) => {
    components[`input-${i + 1}`] = {
      _kind: "input",
      backgroundColor: inp.backgroundColor, textColor: inp.textColor,
      rounded: inp.borderRadius, padding: inp.padding,
      borderColor: inp.borderColor, borderWidth: inp.borderWidth,
    };
  });
  return {
    name: t.meta?.title || "Design System",
    description: `Extracted from ${t.meta?.url || "site"}.`,
    colors, typeScale, rounded, spacing, components,
    families: (t.typography?.families || []).map((f) => f.primary),
    source: "tokens.json",
  };
}

// ---------- helpers ----------
function resolveRef(val, model) {
  // resolve "{colors.primary}" / "{rounded.pill}" etc. against the model
  if (typeof val !== "string") return val;
  const m = val.match(/^\{([\w-]+)\.([\w-]+)\}$/);
  if (!m) return val;
  const [, grp, key] = m;
  const map = { colors: model.colors, rounded: model.rounded, spacing: model.spacing };
  return (map[grp] && map[grp][key]) || val;
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function readableText(hex) {
  // pick black/white label color for a swatch background
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#000";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#111" : "#fff";
}

// ---------- HTML rendering ----------
function isColorValue(v) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^#[0-9a-f]{3,8}$/i.test(s) || /^(rgb|hsl)a?\([^)]*\)$/i.test(s);
}
function renderColorSwatches(colors) {
  const entries = Object.entries(colors).filter(([, v]) => isColorValue(v));
  if (!entries.length) return `<p class="empty">No colors captured.</p>`;
  return `<div class="swatch-grid">` + entries.map(([name, hex]) => `
    <div class="swatch">
      <div class="swatch-chip" style="background:${esc(hex)};color:${readableText(hex)}">${esc(hex)}</div>
      <div class="swatch-meta"><span class="swatch-name">${esc(name)}</span></div>
    </div>`).join("") + `</div>`;
}

function renderTypeLadder(typeScale) {
  if (!typeScale.length) return `<p class="empty">No type scale captured.</p>`;
  return typeScale.map((t) => {
    const feat = t.fontFeature ? `font-feature-settings:${esc(t.fontFeature)};` : "";
    const style = `font-family:${esc(t.fontFamily)},sans-serif;font-size:${esc(t.fontSize)};font-weight:${esc(t.fontWeight)};line-height:${esc(t.lineHeight)};letter-spacing:${esc(t.letterSpacing)};${feat}`;
    return `
    <div class="type-row">
      <div class="type-spec">
        <code>${esc(t.tier)}</code>
        <span>${esc(t.fontSize)} · ${esc(t.fontWeight)} · ls ${esc(t.letterSpacing)}${t.fontFeature ? " · " + esc(t.fontFeature) : ""}</span>
      </div>
      <div class="type-sample" style="${style}">${esc(t.fontFamily || "Sample")} — Ag 123</div>
    </div>`;
  }).join("");
}

function renderScale(obj, label) {
  const entries = Object.entries(obj);
  if (!entries.length) return `<p class="empty">No ${label} captured.</p>`;
  return `<div class="scale-row">` + entries.map(([name, val]) => `
    <div class="scale-item">
      <div class="scale-box" style="${label === "radius" ? `border-radius:${esc(val)};` : `width:${esc(val)};`}"></div>
      <code>${esc(name)}</code><span>${esc(val)}</span>
    </div>`).join("") + `</div>`;
}

function renderComponents(components, model) {
  const entries = Object.entries(components);
  if (!entries.length) return `<p class="empty">No components captured.</p>`;
  return `<div class="comp-grid">` + entries.map(([name, c]) => {
    const bg = resolveRef(c.backgroundColor, model);
    const fg = resolveRef(c.textColor, model);
    const rad = resolveRef(c.rounded, model);
    const kind = c._kind || (name.includes("button") ? "button" : name.includes("card") ? "card" : name.includes("input") ? "input" : "button");
    const border = c.borderColor && c.borderWidth && c.borderWidth !== "0px" ? `border:${esc(c.borderWidth)} solid ${esc(resolveRef(c.borderColor, model))};` : "";
    let demo = "";
    if (kind === "button") {
      demo = `<button class="demo-btn" style="background:${esc(bg)};color:${esc(fg)};border-radius:${esc(rad)};padding:${esc(c.padding || "8px 16px")};${border}font-size:${esc(c.fontSize || "15px")};font-weight:${esc(c.fontWeight || "500")}">${esc(c._text || "Button")}</button>`;
    } else if (kind === "card") {
      demo = `<div class="demo-card" style="background:${esc(bg)};border-radius:${esc(rad)};padding:${esc(c.padding || "24px")};box-shadow:${esc(c.boxShadow || "none")};${border}"><div class="demo-card-bar"></div><div class="demo-card-bar short"></div></div>`;
    } else {
      demo = `<div class="demo-input" style="background:${esc(bg)};color:${esc(fg)};border-radius:${esc(rad)};padding:${esc(c.padding || "8px 12px")};${border}">input text</div>`;
    }
    return `<div class="comp-cell"><div class="comp-stage">${demo}</div><code>${esc(name)}</code></div>`;
  }).join("") + `</div>`;
}

function renderScreenshots(dir) {
  if (!dir || !fs.existsSync(dir)) return "";
  const shots = fs.readdirSync(dir).filter((f) => /^screenshot-.*\.png$/i.test(f));
  if (!shots.length) return "";
  return `<section class="block">
    <h2>Captured screenshots <span class="sub">— compare against the swatches above</span></h2>
    <div class="shots">` + shots.map((f) => {
      const b64 = fs.readFileSync(path.join(dir, f)).toString("base64");
      return `<figure><img src="data:image/png;base64,${b64}" alt="${esc(f)}"/><figcaption>${esc(f)}</figcaption></figure>`;
    }).join("") + `</div></section>`;
}

function buildHtml(model, screenshotsDir) {
  const canvas = model.colors.canvas || "#ffffff";
  const ink = model.colors.ink || "#111111";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>DESIGN.md preview — ${esc(model.name)}</title>
<style>
  /* Neutral, restrained verification chrome — intentionally plain so the
     rendered TOKENS are what stands out, not the preview's own styling. */
  :root{
    --chrome-bg:#0f1115; --chrome-panel:#171a21; --chrome-line:#262b36;
    --chrome-text:#e6e9ef; --chrome-mute:#8b93a3; --chrome-accent:#6ee7b7;
  }
  [data-theme="light"]{
    --chrome-bg:#f4f5f7; --chrome-panel:#ffffff; --chrome-line:#e3e6ec;
    --chrome-text:#1a1d24; --chrome-mute:#6b7280; --chrome-accent:#0f9d6b;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--chrome-bg);color:var(--chrome-text);
    font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    line-height:1.5;padding:32px 24px 80px;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1100px;margin:0 auto}
  header{display:flex;align-items:flex-start;justify-content:space-between;
    gap:24px;padding-bottom:24px;border-bottom:1px solid var(--chrome-line);margin-bottom:32px}
  h1{font-size:20px;font-weight:600;letter-spacing:-0.01em}
  .desc{color:var(--chrome-mute);font-size:13px;margin-top:8px;max-width:680px;line-height:1.6}
  .src-tag{display:inline-block;font-size:11px;color:var(--chrome-mute);
    border:1px solid var(--chrome-line);border-radius:4px;padding:2px 8px;margin-top:10px}
  .toggle{flex:none;font:inherit;font-size:12px;color:var(--chrome-text);
    background:var(--chrome-panel);border:1px solid var(--chrome-line);
    border-radius:6px;padding:8px 14px;cursor:pointer}
  .toggle:hover{border-color:var(--chrome-accent)}
  .block{background:var(--chrome-panel);border:1px solid var(--chrome-line);
    border-radius:10px;padding:24px;margin-bottom:20px}
  h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;
    color:var(--chrome-mute);margin-bottom:18px}
  h2 .sub{text-transform:none;letter-spacing:0;font-weight:400;font-size:12px}
  .empty{color:var(--chrome-mute);font-size:13px;font-style:italic}
  /* color swatches */
  .swatch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
  .swatch{border:1px solid var(--chrome-line);border-radius:8px;overflow:hidden}
  .swatch-chip{height:64px;display:flex;align-items:flex-end;padding:8px;font-size:11px;font-weight:600}
  .swatch-meta{padding:8px 10px;background:var(--chrome-panel)}
  .swatch-name{font-size:12px;color:var(--chrome-text)}
  /* type ladder */
  .type-row{display:grid;grid-template-columns:200px 1fr;gap:20px;align-items:baseline;
    padding:14px 0;border-bottom:1px solid var(--chrome-line)}
  .type-row:last-child{border-bottom:none}
  .type-spec code{font-size:12px;color:var(--chrome-accent);display:block;margin-bottom:4px}
  .type-spec span{font-size:11px;color:var(--chrome-mute)}
  .type-sample{color:var(--chrome-text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  [data-theme="light"] .type-sample{color:#111}
  /* scales */
  .scale-row{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end}
  .scale-item{text-align:center}
  .scale-box{height:40px;min-width:8px;background:var(--chrome-accent);
    border:1px solid var(--chrome-line);margin-bottom:8px}
  .scale-item code{font-size:11px;color:var(--chrome-accent);display:block}
  .scale-item span{font-size:10px;color:var(--chrome-mute)}
  /* components */
  .comp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
  .comp-cell{border:1px dashed var(--chrome-line);border-radius:8px;padding:16px;text-align:center}
  .comp-stage{min-height:80px;display:flex;align-items:center;justify-content:center;
    margin-bottom:10px;background:repeating-conic-gradient(#80808015 0% 25%,transparent 0% 50%) 50%/16px 16px}
  .comp-cell code{font-size:11px;color:var(--chrome-mute)}
  .demo-btn{border:none;cursor:default;font-family:inherit}
  .demo-card{width:140px;min-height:70px;text-align:left}
  .demo-card-bar{height:8px;background:#80808055;border-radius:3px;margin-bottom:8px}
  .demo-card-bar.short{width:60%}
  .demo-input{min-width:130px;text-align:left;font-size:13px}
  /* screenshots */
  .shots{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .shots figure{border:1px solid var(--chrome-line);border-radius:8px;overflow:hidden}
  .shots img{width:100%;display:block}
  .shots figcaption{font-size:11px;color:var(--chrome-mute);padding:8px 10px}
  @media(max-width:720px){.type-row{grid-template-columns:1fr}.shots{grid-template-columns:1fr}}
  footer{color:var(--chrome-mute);font-size:11px;text-align:center;margin-top:32px}
</style>
</head>
<body data-theme="dark">
<div class="wrap">
  <header>
    <div>
      <h1>${esc(model.name)}</h1>
      <p class="desc">${esc(model.description)}</p>
      <span class="src-tag">rendered from ${esc(model.source)} · faithful token preview</span>
    </div>
    <button class="toggle" onclick="(function(){var b=document.body;b.dataset.theme=b.dataset.theme==='dark'?'light':'dark';})()">◐ theme</button>
  </header>

  <section class="block">
    <h2>Color palette <span class="sub">— exact extracted values</span></h2>
    ${renderColorSwatches(model.colors)}
  </section>

  <section class="block">
    <h2>Type scale <span class="sub">— rendered in captured family / weight / tracking</span></h2>
    ${renderTypeLadder(model.typeScale)}
  </section>

  <section class="block">
    <h2>Radius scale</h2>
    ${renderScale(model.rounded, "radius")}
  </section>

  <section class="block">
    <h2>Spacing scale</h2>
    ${renderScale(model.spacing, "spacing")}
  </section>

  <section class="block">
    <h2>Components <span class="sub">— measured samples, rendered to spec</span></h2>
    ${renderComponents(model.components, model)}
  </section>

  ${renderScreenshots(screenshotsDir)}

  <footer>Verification preview · compare each token against the original site. Generated deterministically from design tokens.</footer>
</div>
</body>
</html>`;
}

// ---------- main ----------
function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error('Usage: node preview.js <DESIGN.md | tokens.json> [--out preview.html] [--screenshots DIR] [--title "Brand"]');
    process.exit(2);
  }
  if (!fs.existsSync(args.input)) { console.error("Input not found:", args.input); process.exit(2); }
  const raw = fs.readFileSync(args.input, "utf8");

  let model;
  try {
    if (args.input.endsWith(".json") || raw.trim().startsWith("{")) {
      model = fromTokensJson(JSON.parse(raw));
    } else {
      const fm = parseFrontmatter(raw);
      if (!fm) throw new Error("No YAML frontmatter found in the DESIGN.md");
      model = fromFrontmatter(fm);
    }
  } catch (e) {
    console.error("Failed to parse input:", e.message);
    process.exit(5);
  }
  if (args.title) model.name = args.title;

  const html = buildHtml(model, args.screenshots);
  const out = args.out || path.join(path.dirname(args.input), "preview.html");
  fs.writeFileSync(out, html);
  console.log(JSON.stringify({
    ok: true, out,
    rendered: {
      colors: Object.keys(model.colors).length,
      typeTiers: model.typeScale.length,
      radius: Object.keys(model.rounded).length,
      spacing: Object.keys(model.spacing).length,
      components: Object.keys(model.components).length,
      screenshots: args.screenshots && fs.existsSync(args.screenshots)
        ? fs.readdirSync(args.screenshots).filter((f) => /screenshot-.*\.png/i.test(f)).length : 0,
    },
  }, null, 2));
}

main();
