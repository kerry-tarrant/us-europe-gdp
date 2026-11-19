/**
 * fetch-data.js
 *
 * Fetches five metrics for US states and European countries:
 *   1. GDP per capita          — Wikipedia (US) + IMF DataMapper (EU)
 *   2. Total electricity (GWh)  — EIA SEDS HTML table (US) + Eurostat nrg_cb_e (EU)
 *   3. Educational attainment   — Census ACS acs5/subject S1501 (US) + Eurostat edat_lfse_03 (EU)
 *   4. High-tech employment     — Census ACS acs5/profile DP03 (US) + Eurostat isoc_sk_dskl_i21 (EU)
 *   5. Patent applications/M    — Wikipedia/USPTO (US) + Eurostat pat_ep_rtot (EU)
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

// ─── EU country metadata ────────────────────────────────────────────────────

// EU member states only (27 members as of 2024)
const EU_COUNTRY_META = {
  IRL: { name: "Ireland",     flag: "🇮🇪", note: "Inflated by multinationals" },
  LUX: { name: "Luxembourg",  flag: "🇱🇺" },
  DNK: { name: "Denmark",     flag: "🇩🇰" },
  NLD: { name: "Netherlands", flag: "🇳🇱" },
  MLT: { name: "Malta",       flag: "🇲🇹" },
  BEL: { name: "Belgium",     flag: "🇧🇪" },
  AUT: { name: "Austria",     flag: "🇦🇹" },
  SWE: { name: "Sweden",      flag: "🇸🇪" },
  DEU: { name: "Germany",     flag: "🇩🇪" },
  FIN: { name: "Finland",     flag: "🇫🇮" },
  FRA: { name: "France",      flag: "🇫🇷" },
  CYP: { name: "Cyprus",      flag: "🇨🇾" },
  ITA: { name: "Italy",       flag: "🇮🇹" },
  CZE: { name: "Czechia",     flag: "🇨🇿" },
  LTU: { name: "Lithuania",   flag: "🇱🇹" },
  SVN: { name: "Slovenia",    flag: "🇸🇮" },
  ESP: { name: "Spain",       flag: "🇪🇸" },
  POL: { name: "Poland",      flag: "🇵🇱" },
  HRV: { name: "Croatia",     flag: "🇭🇷" },
  PRT: { name: "Portugal",    flag: "🇵🇹" },
  EST: { name: "Estonia",     flag: "🇪🇪" },
  ROU: { name: "Romania",     flag: "🇷🇴" },
  HUN: { name: "Hungary",     flag: "🇭🇺" },
  SVK: { name: "Slovakia",    flag: "🇸🇰" },
  GRC: { name: "Greece",      flag: "🇬🇷" },
  LVA: { name: "Latvia",      flag: "🇱🇻" },
  BGR: { name: "Bulgaria",    flag: "🇧🇬" },
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

// ─── Education ────────────────────────────────────────────────────────────────

async function fetchCensusEducation() {
  // ACS 5-year 2022, subject table S1501 — % with bachelor's degree or higher, population 25+
  console.log("Fetching US educational attainment from Census ACS S1501…");
  const url = "https://api.census.gov/data/2022/acs/acs5/subject" +
    "?get=S1501_C02_015E,NAME&for=state:*";
  const res = await fetchWithRetry(url);
  const rows = await res.json();
  // rows[0] = header ["S1501_C02_015E","NAME","state"]
  // rows[1..] = [pct_string, state_name, fips_code]

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const pct  = parseFloat(rows[i][0]);
    const name = rows[i][1];
    if (isNaN(pct) || pct < 10 || pct > 85) continue;
    results.push({ name, value: Math.round(pct * 10) / 10 });
  }

  if (results.length < 45) throw new Error(`Census education: only ${results.length} states`);
  results.sort((a, b) => b.value - a.value);
  console.log(`Census ACS education: ${results.length} states. Year: 2022`);
  return { data: results, year: 2022 };
}

async function fetchEurostatEducation() {
  console.log("Fetching EU educational attainment from Eurostat edat_lfse_03…");
  const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/edat_lfse_03" +
    "?format=JSON&lang=EN&isced11=ED5-8&age=Y25-64&sex=T";
  const res = await fetchWithRetry(url);
  const json = await res.json();
  const rawData = parseEurostatData(json);
  const results = [];
  let latestYear = 0;
  for (const [isoCode, entry] of Object.entries(rawData)) {
    if (entry.value < 1 || entry.value > 100) continue;
    if (entry.year > latestYear) latestYear = entry.year;
    results.push({ ...EU_COUNTRY_META[isoCode], value: Math.round(entry.value * 10) / 10 });
  }
  results.sort((a, b) => b.value - a.value);
  console.log(`Eurostat education: ${results.length} countries. Year: ${latestYear}`);
  return { data: results, year: latestYear };
}

// ─── High-tech employment ─────────────────────────────────────────────────────

async function fetchCensusHightech() {
  // ACS 5-year 2022, data profile DP03 — % computer, engineering, and science occupations
  console.log("Fetching US STEM employment from Census ACS DP03…");
  const url = "https://api.census.gov/data/2022/acs/acs5/profile" +
    "?get=DP03_0028PE,NAME&for=state:*";
  const res = await fetchWithRetry(url);
  const rows = await res.json();
  // rows[0] = header, rows[1..] = [pct_string, state_name, fips]

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const pct  = parseFloat(rows[i][0]);
    const name = rows[i][1];
    if (isNaN(pct) || pct < 0.5 || pct > 30) continue;
    results.push({ name, value: Math.round(pct * 10) / 10 });
  }

  if (results.length < 40) throw new Error(`Census hightech: only ${results.length} states`);
  results.sort((a, b) => b.value - a.value);
  console.log(`Census ACS hightech: ${results.length} states`);
  return results;
}

async function fetchEurostatHightech() {
  // isoc_sk_dskl_i21: ICT specialist employment as % of total employed, by country
  console.log("Fetching EU ICT specialist employment from Eurostat isoc_sk_dskl_i21…");
  const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_sk_dskl_i21" +
    "?format=JSON&lang=EN&unit=PC_EMP&sex=T&age=Y15_74";
  const res = await fetchWithRetry(url);
  const json = await res.json();
  const rawData = parseEurostatData(json);
  const results = [];
  let latestYear = 0;
  for (const [isoCode, entry] of Object.entries(rawData)) {
    if (entry.value < 0.5 || entry.value > 25) {
      console.warn(`Eurostat ICT: implausible value for ${isoCode}: ${entry.value}`);
      continue;
    }
    if (entry.year > latestYear) latestYear = entry.year;
    results.push({ ...EU_COUNTRY_META[isoCode], value: Math.round(entry.value * 10) / 10 });
  }
  results.sort((a, b) => b.value - a.value);
  console.log(`Eurostat ICT hightech: ${results.length} countries. Year: ${latestYear}`);
  return { data: results, year: latestYear };
}

// ─── Patents ──────────────────────────────────────────────────────────────────

async function fetchWikipediaPatents() {
  console.log("Fetching US patent data from Wikipedia…");
  // Try multiple possible page titles
  const pageTitles = [
    "List_of_U.S._states_and_territories_by_patent_activity",
    "List_of_U.S._states_by_patent_activity",
  ];

  let json = null;
  for (const page of pageTitles) {
    const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "parse", page, prop: "wikitext", format: "json", origin: "*",
    });
    const res = await fetchWithRetry(url);
    const candidate = await res.json();
    if (!candidate.error) { json = candidate; break; }
    console.warn(`Wikipedia patents: page "${page}" not found, trying next…`);
  }
  if (!json) throw new Error("Wikipedia patents: no matching page found");
  const wikitext = json.parse.wikitext["*"];

  const yearMatch = wikitext.match(/patent[^0-9]*(\d{4})/i);
  const dataYear = yearMatch ? parseInt(yearMatch[1]) : null;

  let perMillionCol = -1;
  const lines = wikitext.split("\n");
  for (const line of lines) {
    if (line.startsWith("!") && (line.toLowerCase().includes("million") || line.toLowerCase().includes("per mil"))) {
      const cols = line.split("!!").map(c => c.trim());
      const idx = cols.findIndex(c => c.toLowerCase().includes("million") || c.toLowerCase().includes("per mil"));
      if (idx >= 1) { perMillionCol = idx - 1; break; }
    }
  }

  const results = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stateMatch = line.match(/^\|\s*(?:\{\{[^}]+\}\}\s*)?\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/);
    if (!stateMatch) continue;

    let stateName = stateMatch[1]
      .replace("Washington (state)", "Washington")
      .replace(" (state)", "")
      .trim();
    if (stateName === "United States" || seen.has(stateName)) continue;

    const cells = line.split("||").slice(1).map(c => c.replace(/'''|<[^>]+>|,/g, "").trim());
    let perMillion = null;

    if (perMillionCol >= 0 && cells.length > perMillionCol) {
      const v = parseFloat(cells[perMillionCol]);
      if (v >= 1 && v <= 10000) perMillion = v;
    }

    if (perMillion === null) {
      const vals = cells.map(c => parseFloat(c)).filter(v => !isNaN(v) && v >= 10 && v <= 5000);
      if (vals.length > 0) perMillion = vals[0];
    }

    if (perMillion === null) continue;
    seen.add(stateName);
    results.push({ name: stateName, value: Math.round(perMillion) });
  }

  if (results.length < 40) throw new Error(`Wikipedia patents: only ${results.length} states`);
  results.sort((a, b) => b.value - a.value);
  console.log(`Wikipedia patents: ${results.length} states. Year: ${dataYear}`);
  return { data: results, year: dataYear || 2020 };
}

async function fetchEurostatPatents() {
  console.log("Fetching EU patent applications from Eurostat pat_ep_rtot…");
  const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/pat_ep_rtot" +
    "?format=JSON&lang=EN&unit=P_MHAB";
  const res = await fetchWithRetry(url);
  const json = await res.json();
  const rawData = parseEurostatData(json);
  const results = [];
  let latestYear = 0;
  for (const [isoCode, entry] of Object.entries(rawData)) {
    if (entry.value < 0 || entry.value > 10000) {
      console.warn(`Eurostat patents: implausible value for ${isoCode}: ${entry.value}`);
      continue;
    }
    if (entry.year > latestYear) latestYear = entry.year;
    results.push({ ...EU_COUNTRY_META[isoCode], value: Math.round(entry.value * 10) / 10 });
  }
  results.sort((a, b) => b.value - a.value);
  console.log(`Eurostat patents: ${results.length} countries. Year: ${latestYear}`);
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

  // ── Education ─────────────────────────────────────────────────────────────
  let educationData = existing.education ?? { us: [], eu: [], usYear: null, euYear: null };
  try {
    const [usEdu, euEdu] = await Promise.all([fetchCensusEducation(), fetchEurostatEducation()]);
    educationData = { us: usEdu.data, eu: euEdu.data, usYear: usEdu.year, euYear: euEdu.year };
  } catch (err) {
    console.error("Education fetch failed — keeping existing data:", err.message);
  }

  // ── High-tech employment ──────────────────────────────────────────────────
  let hightechData = existing.hightech ?? { us: [], eu: [], year: null };
  try {
    const [usHt, euHt] = await Promise.all([fetchCensusHightech(), fetchEurostatHightech()]);
    hightechData = { us: usHt, eu: euHt.data, year: euHt.year };
  } catch (err) {
    console.error("High-tech fetch failed — keeping existing data:", err.message);
  }

  // ── Patents ───────────────────────────────────────────────────────────────
  let patentsData = existing.patents ?? { us: [], eu: [], year: null };
  try {
    const [usPat, euPat] = await Promise.all([fetchWikipediaPatents(), fetchEurostatPatents()]);
    patentsData = { us: usPat.data, eu: euPat.data, year: euPat.year };
  } catch (err) {
    console.error("Patents fetch failed — keeping existing data:", err.message);
  }

  // ── Write data.json ───────────────────────────────────────────────────────
  const output = { gdp: gdpData, electricity: electricityData, education: educationData, hightech: hightechData, patents: patentsData };
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
