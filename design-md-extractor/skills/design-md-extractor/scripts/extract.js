#!/usr/bin/env node
/**
 * extract.js — Deterministic design-token extractor.
 *
 * Opens a URL in a headless browser, walks the rendered DOM, reads
 * getComputedStyle() on visible elements, and aggregates the results into a
 * design-token JSON file. Also captures full-page screenshots (light + an
 * attempted dark variant) so a vision-capable model can later write the
 * interpretive prose sections of a DESIGN.md.
 *
 * It does NOT write prose. Prose is the model's job. This script only emits
 * the deterministic half: colors, typography, spacing, radius, shadows,
 * plus representative component samples.
 *
 * Usage:
 *   node extract.js <url> [--out DIR] [--routes /a,/b] [--channel chrome]
 *                        [--executable /path/to/chrome] [--no-screenshots]
 *
 * Output (in --out, default ./design-md-out):
 *   tokens.json          aggregated design tokens
 *   raw-samples.json     per-element raw samples (for debugging / re-analysis)
 *   screenshot-<route>.png
 *
 * Exit codes: 0 ok, 2 bad args, 3 browser launch failed, 4 navigation failed.
 */

const fs = require("fs");
const path = require("path");

// ---------- arg parsing ----------
function parseArgs(argv) {
  const args = { url: null, out: "design-md-out", routes: [], channel: null, executable: null, screenshots: true };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--out") args.out = rest[++i];
    else if (a === "--routes") args.routes = rest[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--channel") args.channel = rest[++i];
    else if (a === "--executable") args.executable = rest[++i];
    else if (a === "--no-screenshots") args.screenshots = false;
    else if (!a.startsWith("--") && !args.url) args.url = a;
  }
  return args;
}

// ---------- color helpers ----------
function rgbToHex(rgb) {
  // accepts "rgb(r, g, b)" or "rgba(r, g, b, a)"
  const m = rgb && rgb.match(/rg#?a?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(",").map((s) => s.trim());
  if (parts.length < 3) return null;
  const a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
  if (a === 0) return null; // fully transparent — not a real surface color
  const [r, g, b] = parts.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))));
  const hex = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return hex.toLowerCase();
}

// the in-page collector. Runs in the browser context.
function collectInPage() {
  const out = {
    colorCounts: {},        // hex -> {fg: n, bg: n, border: n}
    fontFamilies: {},       // family string -> count
    typeSamples: [],        // {tag, role, fontSize, fontWeight, lineHeight, letterSpacing, fontFamily, fontFeatureSettings, color}
    radii: {},              // px -> count
    spacings: {},           // px -> count (paddings + gaps)
    shadows: {},            // shadow string -> count
    buttons: [],            // representative button styles
    inputs: [],             // representative input styles
    cards: [],              // representative card-like containers
    meta: { title: document.title, url: location.href },
  };

  const seenButton = new Set();
  const seenCard = new Set();

  function bump(obj, key) {
    if (key == null || key === "") return;
    obj[key] = (obj[key] || 0) + 1;
  }
  function hexFromComputed(v) {
    if (!v) return null;
    const m = v.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(",").map((s) => s.trim());
    if (p.length < 3) return null;
    const a = p.length >= 4 ? parseFloat(p[3]) : 1;
    if (a === 0) return null;
    const [r, g, b] = p.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))));
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toLowerCase();
  }
  function visible(el, rect, cs) {
    if (!rect || rect.width < 2 || rect.height < 2) return false;
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    if (rect.bottom < 0 || rect.top > 6000) return false; // only near the top viewport-ish region
    return true;
  }

  const all = Array.from(document.querySelectorAll("*"));
  for (const el of all) {
    let cs, rect;
    try { cs = getComputedStyle(el); rect = el.getBoundingClientRect(); } catch (e) { continue; }
    if (!visible(el, rect, cs)) continue;

    const tag = el.tagName.toLowerCase();
    const area = rect.width * rect.height;

    // colors
    const fg = hexFromComputed(cs.color);
    const bg = hexFromComputed(cs.backgroundColor);
    const bc = hexFromComputed(cs.borderTopColor);
    if (fg) { out.colorCounts[fg] = out.colorCounts[fg] || { fg: 0, bg: 0, border: 0 }; out.colorCounts[fg].fg++; }
    if (bg) { out.colorCounts[bg] = out.colorCounts[bg] || { fg: 0, bg: 0, border: 0 }; out.colorCounts[bg].bg += Math.max(1, Math.round(area / 50000)); }
    if (bc && cs.borderTopWidth !== "0px") { out.colorCounts[bc] = out.colorCounts[bc] || { fg: 0, bg: 0, border: 0 }; out.colorCounts[bc].border++; }

    // fonts
    if (cs.fontFamily) bump(out.fontFamilies, cs.fontFamily);

    // radius
    ["borderTopLeftRadius", "borderTopRightRadius"].forEach((k) => {
      const v = cs[k];
      if (v && v !== "0px" && !v.includes("%")) bump(out.radii, v);
    });

    // spacing (paddings + flex/grid gaps)
    ["paddingTop", "paddingLeft"].forEach((k) => {
      const v = cs[k];
      if (v && v !== "0px") bump(out.spacings, v);
    });
    if (cs.gap && cs.gap !== "normal" && cs.gap !== "0px") {
      cs.gap.split(" ").forEach((g) => { if (g !== "0px") bump(out.spacings, g); });
    }

    // shadow
    if (cs.boxShadow && cs.boxShadow !== "none") bump(out.shadows, cs.boxShadow.slice(0, 200));

    // typography samples — only for text-bearing elements with direct text
    const directText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (directText && rect.height >= 8) {
      out.typeSamples.push({
        tag,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        fontFamily: cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim(),
        fontFeatureSettings: cs.fontFeatureSettings,
        textTransform: cs.textTransform,
        color: fg,
        approxArea: Math.round(area),
      });
    }

    // buttons
    const looksButton = tag === "button" || el.getAttribute("role") === "button" ||
      (tag === "a" && (cs.display === "inline-block" || cs.display === "flex") && bg && parseFloat(cs.paddingLeft) >= 6 && rect.height >= 24 && rect.height <= 80);
    if (looksButton) {
      const sig = `${bg}|${fg}|${cs.borderTopLeftRadius}|${cs.fontSize}|${cs.fontWeight}`;
      if (!seenButton.has(sig) && out.buttons.length < 12) {
        seenButton.add(sig);
        out.buttons.push({
          text: (el.textContent || "").trim().slice(0, 24),
          backgroundColor: bg, textColor: fg,
          borderRadius: cs.borderTopLeftRadius,
          borderColor: cs.borderTopWidth !== "0px" ? bc : null,
          borderWidth: cs.borderTopWidth,
          padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
          fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing,
        });
      }
    }

    // inputs
    if (tag === "input" || tag === "textarea" || tag === "select") {
      if (out.inputs.length < 6) {
        out.inputs.push({
          type: el.getAttribute("type") || tag,
          backgroundColor: bg, textColor: fg,
          borderRadius: cs.borderTopLeftRadius,
          borderColor: bc, borderWidth: cs.borderTopWidth,
          padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
          fontSize: cs.fontSize,
        });
      }
    }

    // cards — bordered or shadowed block containers of meaningful size
    const hasEdge = (cs.boxShadow && cs.boxShadow !== "none") || (cs.borderTopWidth !== "0px" && bc);
    const radiusNonZero = cs.borderTopLeftRadius && cs.borderTopLeftRadius !== "0px";
    if (hasEdge && radiusNonZero && rect.width >= 120 && rect.height >= 80 && area < 800000) {
      const sig = `${bg}|${cs.borderTopLeftRadius}|${(cs.boxShadow || "").slice(0, 40)}`;
      if (!seenCard.has(sig) && out.cards.length < 10) {
        seenCard.add(sig);
        out.cards.push({
          backgroundColor: bg,
          borderRadius: cs.borderTopLeftRadius,
          borderColor: cs.borderTopWidth !== "0px" ? bc : null,
          borderWidth: cs.borderTopWidth,
          boxShadow: (cs.boxShadow || "none").slice(0, 200),
          padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        });
      }
    }
  }
  return out;
}

// ---------- aggregation (node side) ----------
function aggregate(raw) {
  // ---- colors: rank by weighted prominence ----
  const colorEntries = Object.entries(raw.colorCounts).map(([hex, c]) => {
    const score = c.bg * 3 + c.fg * 1 + c.border * 0.5;
    return { hex, ...c, score };
  }).sort((a, b) => b.score - a.score);

  const surfaces = colorEntries.filter((c) => c.bg >= c.fg).slice(0, 8);
  const texts = colorEntries.filter((c) => c.fg > c.bg).slice(0, 6);
  const borders = colorEntries.filter((c) => c.border > 0).sort((a, b) => b.border - a.border).slice(0, 4);

  // ---- typography: cluster by rounded font-size, keep dominant weight ----
  const bySize = {};
  for (const s of raw.typeSamples) {
    const px = Math.round(parseFloat(s.fontSize));
    if (!px || px < 8 || px > 120) continue;
    (bySize[px] = bySize[px] || []).push(s);
  }
  const typeScale = Object.entries(bySize).map(([px, arr]) => {
    // pick the most common weight & family at this size
    const wCount = {}, fCount = {}, lhSet = {}, lsSet = {}, featSet = {};
    let totalArea = 0;
    for (const s of arr) {
      wCount[s.fontWeight] = (wCount[s.fontWeight] || 0) + 1;
      fCount[s.fontFamily] = (fCount[s.fontFamily] || 0) + 1;
      lhSet[s.lineHeight] = (lhSet[s.lineHeight] || 0) + 1;
      lsSet[s.letterSpacing] = (lsSet[s.letterSpacing] || 0) + 1;
      featSet[s.fontFeatureSettings] = (featSet[s.fontFeatureSettings] || 0) + 1;
      totalArea += s.approxArea || 0;
    }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      fontSize: parseInt(px, 10),
      fontWeight: top(wCount),
      fontFamily: top(fCount),
      lineHeight: top(lhSet),
      letterSpacing: top(lsSet),
      fontFeatureSettings: top(featSet) === "normal" ? null : top(featSet),
      sampleCount: arr.length,
      prominence: totalArea,
    };
  }).sort((a, b) => b.fontSize - a.fontSize);

  // ---- font families ranked ----
  const families = Object.entries(raw.fontFamilies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([family, count]) => ({ family, count, primary: family.split(",")[0].replace(/['"]/g, "").trim() }));

  // ---- radius / spacing / shadow scales ----
  const scaleFrom = (obj, max) => Object.entries(obj)
    .map(([px, n]) => ({ value: px, count: n, num: parseFloat(px) }))
    .filter((x) => !isNaN(x.num))
    .sort((a, b) => a.num - b.num)
    .filter((x, i, arr) => arr.findIndex((y) => y.num === x.num) === i)
    .slice(0, max);

  const radius = scaleFrom(raw.radii, 8);
  const spacing = scaleFrom(raw.spacings, 12);
  const shadows = Object.entries(raw.shadows)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }));

  return {
    meta: raw.meta,
    colors: {
      surfaces: surfaces.map((c) => ({ hex: c.hex, bgWeight: c.bg, role: "surface-candidate" })),
      text: texts.map((c) => ({ hex: c.hex, fgWeight: c.fg, role: "text-candidate" })),
      borders: borders.map((c) => ({ hex: c.hex, borderWeight: c.border, role: "hairline-candidate" })),
      // accents: saturated colors that appear on buttons get flagged downstream
    },
    typography: { families, scale: typeScale },
    radius,
    spacing,
    shadows,
    components: {
      buttons: raw.buttons,
      inputs: raw.inputs,
      cards: raw.cards,
    },
  };
}

function mergeRouteData(routeResults) {
  // Merge multiple routes by summing raw counts before aggregation would be ideal,
  // but to keep it simple and robust we aggregate per-route and keep the richest,
  // then union the component samples.
  if (routeResults.length === 1) {
    const agg = aggregate(routeResults[0].raw);
    return { aggregate: agg, raw: { [routeResults[0].route]: routeResults[0].raw } };
  }
  // sum colorCounts/fonts/radii/spacings/shadows; concat samples
  const summed = {
    colorCounts: {}, fontFamilies: {}, typeSamples: [], radii: {}, spacings: {},
    shadows: {}, buttons: [], inputs: [], cards: [], meta: routeResults[0].raw.meta,
  };
  const addCounts = (dst, src) => { for (const [k, v] of Object.entries(src)) {
    if (typeof v === "number") dst[k] = (dst[k] || 0) + v;
    else { dst[k] = dst[k] || { fg: 0, bg: 0, border: 0 }; dst[k].fg += v.fg; dst[k].bg += v.bg; dst[k].border += v.border; }
  }};
  const rawByRoute = {};
  for (const r of routeResults) {
    rawByRoute[r.route] = r.raw;
    addCounts(summed.colorCounts, r.raw.colorCounts);
    addCounts(summed.fontFamilies, r.raw.fontFamilies);
    addCounts(summed.radii, r.raw.radii);
    addCounts(summed.spacings, r.raw.spacings);
    addCounts(summed.shadows, r.raw.shadows);
    summed.typeSamples.push(...r.raw.typeSamples);
    summed.buttons.push(...r.raw.buttons);
    summed.inputs.push(...r.raw.inputs);
    summed.cards.push(...r.raw.cards);
  }
  // de-dupe component samples roughly
  const dedupe = (arr, keyFn, limit) => {
    const seen = new Set(); const out = [];
    for (const x of arr) { const k = keyFn(x); if (!seen.has(k)) { seen.add(k); out.push(x); } if (out.length >= limit) break; }
    return out;
  };
  summed.buttons = dedupe(summed.buttons, (b) => `${b.backgroundColor}|${b.textColor}|${b.borderRadius}`, 12);
  summed.inputs = dedupe(summed.inputs, (i) => `${i.backgroundColor}|${i.borderRadius}`, 6);
  summed.cards = dedupe(summed.cards, (c) => `${c.backgroundColor}|${c.borderRadius}|${c.boxShadow.slice(0,40)}`, 10);
  return { aggregate: aggregate(summed), raw: rawByRoute };
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error("Usage: node extract.js <url> [--out DIR] [--routes /a,/b] [--channel chrome] [--executable PATH] [--no-screenshots]");
    process.exit(2);
  }
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) {
    console.error("Playwright not installed. Run: npm install playwright && npx playwright install chromium");
    process.exit(3);
  }

  const launchOpts = { headless: true };
  if (args.channel) launchOpts.channel = args.channel;        // e.g. "chrome" / "msedge" — use system browser
  if (args.executable) launchOpts.executablePath = args.executable;

  let browser;
  try {
    browser = await playwright.chromium.launch(launchOpts);
  } catch (e) {
    console.error("Browser launch failed:", e.message);
    console.error("Tip: pass --channel chrome to use an installed Chrome, or run `npx playwright install chromium`.");
    process.exit(3);
  }

  fs.mkdirSync(args.out, { recursive: true });

  const base = new URL(args.url);
  const routes = args.routes.length ? args.routes : ["/"];
  const routeResults = [];

  try {
    for (const route of routes) {
      const target = route === "/" || route.startsWith("/")
        ? new URL(route, base.origin).href
        : route; // allow absolute URLs in --routes
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      try {
        await page.goto(target, { waitUntil: "networkidle", timeout: 45000 });
      } catch (e) {
        try { await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 }); }
        catch (e2) { console.error(`Navigation failed for ${target}: ${e2.message}`); await ctx.close(); continue; }
      }
      await page.waitForTimeout(1500); // let webfonts/animations settle
      // dismiss obvious cookie/consent overlays so they don't dominate samples
      try {
        await page.evaluate(() => {
          const kill = (el) => { try { el.remove(); } catch (e) {} };
          document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[aria-modal="true"]').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width > 200 && r.height > 80) kill(el);
          });
        });
      } catch (e) {}

      const raw = await page.evaluate(collectInPage);
      const safeRoute = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
      routeResults.push({ route: safeRoute, raw });

      if (args.screenshots) {
        try {
          await page.screenshot({ path: path.join(args.out, `screenshot-${safeRoute}.png`), fullPage: false });
        } catch (e) { console.error("screenshot failed:", e.message); }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  if (!routeResults.length) {
    console.error("No routes could be loaded. Nothing extracted.");
    process.exit(4);
  }

  const { aggregate: agg, raw } = mergeRouteData(routeResults);
  fs.writeFileSync(path.join(args.out, "tokens.json"), JSON.stringify(agg, null, 2));
  fs.writeFileSync(path.join(args.out, "raw-samples.json"), JSON.stringify(raw, null, 2));

  console.log(JSON.stringify({
    ok: true,
    out: args.out,
    routesLoaded: routeResults.map((r) => r.route),
    summary: {
      surfaceColors: agg.colors.surfaces.length,
      textColors: agg.colors.text.length,
      typeSizes: agg.typography.scale.length,
      families: agg.typography.families.map((f) => f.primary),
      buttons: agg.components.buttons.length,
      cards: agg.components.cards.length,
      radiusSteps: agg.radius.length,
      spacingSteps: agg.spacing.length,
    },
  }, null, 2));
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
