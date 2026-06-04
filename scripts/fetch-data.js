/**
 * fetch-data.js
 *
 * Fetches three metrics for US states and European countries:
 *   1. GDP per capita          — Wikipedia (US) + IMF DataMapper (EU)
 *   2. Total electricity (GWh)  — EIA SEDS HTML table (US) + Eurostat nrg_cb_e (EU)
 *   3. Gross per capita income  — Wikipedia/BEA per capita personal income (US) + Eurostat ilc_di03 (EU)
 *
 * Writes results to src/data.json. No API keys required.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, "../src/data.json");
const RAW_PATH  = path.join(__dirname, "../data");

// PPS → USD conversion rate (approximate; 1 PPS ≈ 1.07 USD as of 2023)
const PPS_TO_USD = 1.07;

// ─── EU country metadata ────────────────────────────────────────────────────

const EU_COUNTRY_META = {
  IRL: { name: "Ireland",         flag: "🇮🇪", note: "Inflated by multinationals" },
  LUX: { name: "Luxembourg",      flag: "🇱🇺" },
  NOR: { name: "Norway",          flag: "🇳🇴" },
  CHE: { name: "Switzerland",     flag: "🇨🇭" },
  DNK: { name: "Denmark",         flag: "🇩🇰" },
  NLD: { name: "Netherlands",     flag: "🇳🇱" },
  SMR: { name: "San Marino",      flag: "🇸🇲" },
  ISL: { name: "Iceland",         flag: "🇮🇸" },
  MLT: { name: "Malta",           flag: "🇲🇹" },
  BEL: { name: "Belgium",         flag: "🇧🇪" },
  AUT: { name: "Austria",         flag: "🇦🇹" },
  SWE: { name: "Sweden",          flag: "🇸🇪" },
  DEU: { name: "Germany",         flag: "🇩🇪" },
  AND: { name: "Andorra",         flag: "🇦🇩" },
  FIN: { name: "Finland",         flag: "🇫🇮" },
  FRA: { name: "France",          flag: "🇫🇷" },
  CYP: { name: "Cyprus",          flag: "🇨🇾" },
  GBR: { name: "United Kingdom",  flag: "🇬🇧" },
  ITA: { name: "Italy",           flag: "🇮🇹" },
  CZE: { name: "Czechia",         flag: "🇨🇿" },
  LTU: { name: "Lithuania",       flag: "🇱🇹" },
  SVN: { name: "Slovenia",        flag: "🇸🇮" },
  ESP: { name: "Spain",           flag: "🇪🇸" },
  POL: { name: "Poland",          flag: "🇵🇱" },
  HRV: { name: "Croatia",         flag: "🇭🇷" },
  PRT: { name: "Portugal",        flag: "🇵🇹" },
  EST: { name: "Estonia",         flag: "🇪🇪" },
  ROU: { name: "Romania",         flag: "🇷🇴" },
  HUN: { name: "Hungary",         flag: "🇭🇺" },
  SVK: { name: "Slovakia",        flag: "🇸🇰" },
  GRC: { name: "Greece",          flag: "🇬🇷" },
  LVA: { name: "Latvia",          flag: "🇱🇻" },
  BGR: { name: "Bulgaria",        flag: "🇧🇬" },
  MNE: { name: "Montenegro",      flag: "🇲🇪" },
  SRB: { name: "Serbia",          flag: "🇷🇸" },
  MKD: { name: "North Macedonia", flag: "🇲🇰" },
  BIH: { name: "Bosnia & Herz.",  flag: "🇧🇦" },
  ALB: { name: "Albania",         flag: "🇦🇱" },
  XKX: { name: "Kosovo",          flag: "🇽🇰" },
  MDA: { name: "Moldova",         flag: "🇲🇩" },
  UKR: { name: "Ukraine",         flag: "🇺🇦" },
};

// Eurostat uses alpha-2 codes; Greece uses "EL" not "GR"
const EUROSTAT_CODE_MAP = {
  IRL: "IE", LUX: "LU", NOR: "NO", CHE: "CH", DNK: "DK", NLD: "NL",
  SMR: "SM", ISL: "IS", MLT: "MT", BEL: "BE", AUT: "AT", SWE: "SE",
  DEU: "DE", AND: "AD", FIN: "FI", FRA: "FR", CYP: "CY", GBR: "GB",
  ITA: "IT", CZE: "CZ", LTU: "LT", SVN: "SI", ESP: "ES", POL: "PL",
  HRV: "HR", PRT: "PT", EST: "EE", ROU: "RO", HUN: "HU", SVK: "SK",
  GRC: "EL", LVA: "LV", BGR: "BG", MNE: "ME", SRB: "RS", MKD: "MK",
  BIH: "BA", ALB: "AL", XKX: "XK", MDA: "MD", UKR: "UA",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = attempt * 3000;
      console.warn(`Attempt ${attempt} failed (${err.message}). Retrying in ${wait / 1000}s…`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/**
 * Parse Eurostat JSON-stat format.
 * Returns a map of { [iso3Code]: { value, year, ...meta } } for the latest available year.
 * preferredDimValues: hint for non-geo/time dimensions (only needed when URL doesn't filter them).
 */
function parseEurostatData(json, preferredDimValues = {}) {
  const dims    = json.id;
  const sizes   = json.size;
  const dimInfo = json.dimension;

  const geoIdx  = dims.indexOf("geo");
  const timeIdx = dims.indexOf("time");
  if (geoIdx === -1 || timeIdx === -1) throw new Error("Eurostat: missing geo or time dimension");

  const strides = new Array(dims.length).fill(0);
  strides[dims.length - 1] = 1;
  for (let i = dims.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const geoCodes  = dimInfo.geo.category.index;
  const timeCodes = dimInfo.time.category.index;
  const years = Object.keys(timeCodes).map(Number).sort((a, b) => b - a);

  const result = {};

  for (const [isoCode, meta] of Object.entries(EU_COUNTRY_META)) {
    // Eurostat uses alpha-2 codes; look up via EUROSTAT_CODE_MAP
    const eurostatCode = EUROSTAT_CODE_MAP[isoCode] ?? isoCode;
    const geoPos = geoCodes[eurostatCode];
    if (geoPos === undefined) continue;

    for (const year of years) {
      const timePos = timeCodes[String(year)];
      if (timePos === undefined) continue;

      const otherDims = dims
        .map((dim, i) => ({ dim, i }))
        .filter(({ dim }) => dim !== "geo" && dim !== "time");

      const dimOptions = otherDims.map(({ dim }) => {
        const codes = dimInfo[dim]?.category?.index ?? {};
        const preferred = preferredDimValues[dim];
        if (preferred !== undefined && codes[preferred] !== undefined) {
          return [codes[preferred]];
        }
        return Object.values(codes);
      });

      let found = false;
      const combos = cartesianProduct(dimOptions);
      for (const combo of combos.slice(0, 20)) {
        const positions = dims.map((dim, i) => {
          if (dim === "geo")  return geoPos;
          if (dim === "time") return timePos;
          const otherIdx = otherDims.findIndex(d => d.i === i);
          return combo[otherIdx] ?? 0;
        });

        const flatIdx = positions.reduce((acc, pos, i) => acc + pos * strides[i], 0);
        const val = json.value[flatIdx] ?? json.value[String(flatIdx)];
        if (val != null && val > 0) {
          result[isoCode] = { ...meta, value: val, year };
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!result[isoCode]) console.warn(`Eurostat: no data for ${isoCode}`);
  }

  return result;
}

function cartesianProduct(arrays) {
  if (arrays.length === 0) return [[]];
  return arrays.reduce((acc, arr) =>
    acc.flatMap(combo => arr.map(item => [...combo, item])),
    [[]]
  );
}

// ─── GDP ─────────────────────────────────────────────────────────────────────

async function fetchWikipediaStates() {
  console.log("Fetching US state GDP per capita from Wikipedia…");
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "parse",
    page: "List_of_U.S._states_and_territories_by_GDP",
    prop: "wikitext",
    format: "json",
    origin: "*",
  });

  const res = await fetchWithRetry(url);
  const json = await res.json();
  const wikitext = json.parse.wikitext["*"];

  const results = [];
  const seen = new Set();
  let dataYear = null;

  const yearMatch = wikitext.match(/as of (\d{4})/i) || wikitext.match(/GDP.*?(\d{4})/);
  if (yearMatch) dataYear = yearMatch[1];

  const lines = wikitext.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stateMatch = line.match(/^\|\s*\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/);
    if (!stateMatch) continue;

    let stateName = stateMatch[1]
      .replace("Washington (state)", "Washington")
      .replace("United States Virgin Islands", "U.S. Virgin Islands")
      .replace(" (state)", "")
      .trim();

    if (stateName === "United States" || seen.has(stateName)) continue;

    const context = lines.slice(i, i + 6).join(" ");
    const perCapitaMatches = [...context.matchAll(/\$\s*([\d,]{5,7})/g)];
    if (perCapitaMatches.length === 0) continue;

    const raw = perCapitaMatches[perCapitaMatches.length - 1][1].replace(/,/g, "");
    const gdp = parseInt(raw);
    if (isNaN(gdp) || gdp < 5000 || gdp > 500000) continue;

    seen.add(stateName);
    const entry = { name: stateName, value: gdp };
    const notes = {
      "District of Columbia": "Federal district",
      "Puerto Rico":              "Commonwealth",
      "Guam":                     "Territory",
      "U.S. Virgin Islands":      "Territory",
      "Northern Mariana Islands": "Commonwealth",
      "American Samoa":           "Territory",
    };
    if (notes[stateName]) entry.note = notes[stateName];
    results.push(entry);
  }

  if (results.length < 45) throw new Error(`Only parsed ${results.length} states`);
  results.sort((a, b) => b.value - a.value);
  console.log(`Wikipedia: ${results.length} states. Year: ${dataYear}`);
  return { data: results, year: dataYear || new Date().getFullYear() - 1 };
}

async function fetchIMF() {
  const codes = Object.keys(EU_COUNTRY_META).join("/");
  const url = `https://www.imf.org/external/datamapper/api/v1/PPPPC/${codes}`;
  console.log("Fetching IMF European GDP data…");

  const res = await fetchWithRetry(url);
  const json = await res.json();

  const results = [];
  let latestYear = 0;

  for (const [code, meta] of Object.entries(EU_COUNTRY_META)) {
    const values = json?.values?.PPPPC?.[code];
    if (!values) { console.warn(`IMF: no data for ${code}`); continue; }
    const years = Object.keys(values).map(Number).sort((a, b) => b - a);
    const year = years[0];
    const gdp = Math.round(values[year]);
    if (year > latestYear) latestYear = year;
    results.push({ ...meta, value: gdp });
  }

  results.sort((a, b) => b.value - a.value);
  console.log(`IMF: ${results.length} countries. Latest year: ${latestYear}`);
  return { data: results, year: latestYear };
}

// ─── Electricity ─────────────────────────────────────────────────────────────

async function fetchEIAElectricity() {
  console.log("Fetching US total electricity (GWh) from EIA SEDS…");
  // Table row layout: rank | total state (th) | total TWh | per-capita state (th) | per-capita kWh
  // cells[1] = state name, cells[2] = total TWh → convert × 1000 to get GWh
  const url = "https://www.eia.gov/state/seds/sep_sum/html/rank_es_capita.html";
  const res = await fetchWithRetry(url);
  const html = await res.text();

  const results = [];
  const rowRegex  = /<tr>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const stripTags = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").trim();

  for (const rowMatch of html.matchAll(rowRegex)) {
    const cells = [...rowMatch[1].matchAll(cellRegex)].map(m => stripTags(m[1]));
    if (cells.length < 5) continue;

    // cells[0] = rank, cells[1] = total state name, cells[2] = total TWh
    const rank  = parseInt(cells[0]);
    if (isNaN(rank) || rank < 1 || rank > 60) continue;

    const name   = cells[1].replace(/\*+$/, "").replace(/\s+/g, " ").trim();
    const twhStr = cells[2].replace(/,/g, "");
    const twh    = parseFloat(twhStr);
    const gwh    = Math.round(twh * 1000);

    if (!name || isNaN(gwh) || gwh < 1000 || gwh > 600000) continue;
    results.push({ name, value: gwh });
  }

  if (results.length < 40) throw new Error(`EIA: only parsed ${results.length} states`);
  results.sort((a, b) => b.value - a.value);
  console.log(`EIA: ${results.length} states`);
  return results;
}

async function fetchEurostatElectricity() {
  // nrg_cb_e: total final consumption of electricity in GWH per country.
  console.log("Fetching EU total electricity (GWh) from Eurostat nrg_cb_e…");
  const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_cb_e" +
    "?format=JSON&lang=EN&nrg_bal=FC&siec=E7000&unit=GWH";
  const res = await fetchWithRetry(url);
  const json = await res.json();

  const rawData = parseEurostatData(json);

  const results = [];
  let latestYear = 0;

  for (const [isoCode, entry] of Object.entries(rawData)) {
    const gwh = Math.round(entry.value);
    if (gwh < 100 || gwh > 10_000_000) {
      console.warn(`Eurostat elec: implausible value for ${isoCode}: ${gwh} GWh`);
      continue;
    }
    if (entry.year > latestYear) latestYear = entry.year;
    results.push({ ...EU_COUNTRY_META[isoCode], value: gwh });
  }

  results.sort((a, b) => b.value - a.value);
  console.log(`Eurostat electricity: ${results.length} countries. Year: ${latestYear}`);
  return { data: results, year: latestYear };
}

// ─── Income ───────────────────────────────────────────────────────────────────

async function fetchWikipediaIncome() {
  // BEA per capita personal income by state — from the "Per capita personal income by state"
  // section of the Wikipedia income page (sourced from FRED/BEA).
  console.log("Fetching US per capita personal income from Wikipedia (BEA/FRED)…");
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "parse",
    page: "List_of_U.S._states_and_territories_by_income",
    prop: "wikitext",
    format: "json",
    origin: "*",
  });

  const res = await fetchWithRetry(url);
  const json = await res.json();
  const wikitext = json.parse.wikitext["*"];

  const results = [];
  const seen = new Set();
  const lines = wikitext.split("\n");

  // Pass 1: find the exact line range of the "Per capita personal income" section.
  // Only trigger on lines that ARE headings (start with =) to avoid false matches in body text.
  let sectionStart = -1;
  let dataYear = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("=") && t.includes("Per capita personal income")) {
      sectionStart = i + 1;
      const yearMatch = t.match(/\b(20\d{2})\b/);
      if (yearMatch) dataYear = parseInt(yearMatch[1]);
      break;
    }
  }
  if (!dataYear) {
    const fallback = wikitext.match(/per capita personal income[^\n]*?(\d{4})/i);
    if (fallback) dataYear = parseInt(fallback[1]);
  }
  if (sectionStart < 0) {
    throw new Error("Wikipedia income: per-capita section not found — page layout may have changed");
  }
  let sectionEnd = lines.length;
  for (let i = sectionStart; i < lines.length; i++) {
    if (lines[i].trim().startsWith("==")) { sectionEnd = i; break; }
  }

  // Pass 2: parse state rows within that section only.
  for (let i = sectionStart; i < sectionEnd; i++) {
    const line = lines[i].trim();

    const flagMatch = line.match(/^\|[^|]*\{\{flag\|([^}|]+)\}\}/);
    const iconMatch = line.match(/^\|\s*\{\{flagicon\|[^}]+\}\}\s*\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/);
    let stateName = null;
    if (flagMatch)      stateName = flagMatch[1].trim();
    else if (iconMatch) stateName = iconMatch[1].trim();
    if (!stateName) continue;

    stateName = stateName
      .replace("Washington, D.C.", "District of Columbia")
      .replace("Washington (state)", "Washington")
      .trim();

    if (stateName === "United States" || seen.has(stateName)) continue;

    // The 2023 value is on the next line as |$XXX,XXX (or |'''$XXX,XXX''')
    let value = 0;
    for (let j = i + 1; j <= Math.min(i + 3, sectionEnd - 1); j++) {
      const m = lines[j].match(/\$\s*([\d,]+)/);
      if (m) {
        const n = parseInt(m[1].replace(/,/g, ""));
        if (n > 20000 && n < 200000) { value = n; break; }
      }
    }
    if (!value) continue;

    seen.add(stateName);
    results.push({ name: stateName, value });
  }

  if (results.length < 45) throw new Error(`Wikipedia income: only parsed ${results.length} entries`);

  // Apply ~22% combined tax deduction to convert gross BEA income to approximate net.
  results.forEach(r => { r.value = Math.round(r.value * 0.78); });
  results.sort((a, b) => b.value - a.value);
  console.log(`Wikipedia per capita income: ${results.length} states/territories. Year: ${dataYear}`);
  return { data: results, year: dataYear };
}

async function fetchEurostatIncome() {
  // ilc_di03: mean equivalised net disposable income in PPS.
  // Mean (not median) pairs better with BEA per-capita personal income (a mean measure).
  console.log("Fetching EU mean equivalised income from Eurostat ilc_di03…");
  const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ilc_di03" +
    "?format=JSON&lang=EN&indic_il=MEAN_EI&unit=PPS&age=TOTAL&sex=T";
  const res = await fetchWithRetry(url);
  const json = await res.json();

  const rawData = parseEurostatData(json);

  const results = [];
  let latestYear = 0;

  for (const [isoCode, entry] of Object.entries(rawData)) {
    const usd = Math.round(entry.value * PPS_TO_USD);
    if (entry.year > latestYear) latestYear = entry.year;
    results.push({ ...EU_COUNTRY_META[isoCode], value: usd });
  }

  results.sort((a, b) => b.value - a.value);
  console.log(`Eurostat income: ${results.length} countries. Year: ${latestYear}`);
  return { data: results, year: latestYear };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  let existing = {};
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8").replace(/^﻿/, "");
    existing = JSON.parse(raw);
  } catch {
    console.log("No existing data.json — starting fresh.");
  }

  // ── GDP ──────────────────────────────────────────────────────────────────
  let gdpData = existing.gdp ?? { us: [], eu: [], usYear: null, euYear: null };
  try {
    const [wiki, imf] = await Promise.all([fetchWikipediaStates(), fetchIMF()]);
    gdpData = { us: wiki.data, eu: imf.data, usYear: wiki.year, euYear: imf.year };
  } catch (err) {
    console.error("GDP fetch failed — keeping existing data:", err.message);
  }

  // ── Electricity ───────────────────────────────────────────────────────────
  let electricityData = existing.electricity ?? { us: [], eu: [], year: null };
  try {
    const [usElec, euElec] = await Promise.all([fetchEIAElectricity(), fetchEurostatElectricity()]);
    electricityData = { us: usElec, eu: euElec.data, year: euElec.year };
  } catch (err) {
    console.error("Electricity fetch failed — keeping existing data:", err.message);
  }

  // ── Income ────────────────────────────────────────────────────────────────
  let incomeData = existing.income ?? { us: [], eu: [], usYear: null, euYear: null };
  try {
    const [usIncome, euIncome] = await Promise.all([fetchWikipediaIncome(), fetchEurostatIncome()]);
    incomeData = { us: usIncome.data, eu: euIncome.data, usYear: usIncome.year ?? 2023, euYear: euIncome.year };
  } catch (err) {
    console.error("Income fetch failed — keeping existing data:", err.message);
  }

  // ── Write data.json ───────────────────────────────────────────────────────
  const output = { gdp: gdpData, electricity: electricityData, income: incomeData };
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log("Wrote src/data.json");

  // ── Write raw backup ──────────────────────────────────────────────────────
  if (!fs.existsSync(RAW_PATH)) fs.mkdirSync(RAW_PATH);
  fs.writeFileSync(
    path.join(RAW_PATH, "metrics.json"),
    JSON.stringify({ updated: new Date().toISOString().slice(0, 10), ...output }, null, 2),
    "utf8"
  );
  console.log("Done.");
}

main().catch(err => {
  console.error("fetch-data.js failed:", err);
  process.exit(1);
});
