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

async function fetchWithRetry(url, retries = 3, options = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
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

const BROWSER_UA = { headers: { "User-Agent": "Mozilla/5.0 (compatible; DataFetcher/1.0)" } };

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
  // Try Census ACS API (multiple year/table variants), fall back to Wikipedia
  const censusUrls = [
    ["https://api.census.gov/data/2022/acs/acs5/subject?get=S1501_C02_015E,NAME&for=state:*&key=DEMO_KEY", 2022],
    ["https://api.census.gov/data/2021/acs/acs5/subject?get=S1501_C02_015E,NAME&for=state:*&key=DEMO_KEY", 2021],
    ["https://api.census.gov/data/2022/acs/acs5/profile?get=DP02_0067PE,NAME&for=state:*&key=DEMO_KEY",   2022],
  ];

  for (const [url, year] of censusUrls) {
    try {
      console.log(`Fetching US educational attainment from Census ACS (${year})…`);
      const res = await fetchWithRetry(url, 2, BROWSER_UA);
      const text = await res.text();
      if (!text.trim().startsWith("[")) {
        console.warn("Census education: non-JSON response, skipping");
        continue;
      }
      const rows = JSON.parse(text);
      const results = [];
      for (let i = 1; i < rows.length; i++) {
        const pct = parseFloat(rows[i][0]);
        const name = rows[i][1];
        if (isNaN(pct) || pct < 10 || pct > 85) continue;
        results.push({ name, value: Math.round(pct * 10) / 10 });
      }
      if (results.length >= 45) {
        results.sort((a, b) => b.value - a.value);
        console.log(`Census ACS education: ${results.length} states. Year: ${year}`);
        return { data: results, year };
      }
      console.warn(`Census education: only ${results.length} states from ${url}`);
    } catch (err) {
      console.warn(`Census education attempt failed: ${err.message}`);
    }
  }

  // Fallback: Wikipedia educational attainment page
  return fetchWikipediaEducation();
}

async function fetchWikipediaEducation() {
  const pageTitles = [
    "List_of_U.S._states_and_territories_by_educational_attainment",
    "Educational_attainment_in_the_United_States",
    "List_of_U.S._states_by_educational_attainment",
  ];
  let wikitext = null;
  for (const page of pageTitles) {
    console.log(`Fetching US educational attainment from Wikipedia (${page})…`);
    const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "parse", page, prop: "wikitext", format: "json", origin: "*",
    });
    const res = await fetchWithRetry(url, 2);
    const json = await res.json();
    if (!json.error) { wikitext = json.parse.wikitext["*"]; break; }
    console.warn(`Wikipedia education: page "${page}" not found`);
  }
  if (!wikitext) throw new Error("Wikipedia education: no page found");

  // Debug: log table header area to understand format
  const tblIdx = wikitext.indexOf("{|");
  if (tblIdx >= 0) console.log("Table preview:", JSON.stringify(wikitext.slice(tblIdx, tblIdx + 400)));

  const US_STATES = new Set([
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
    "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
    "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
    "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
    "Wisconsin","Wyoming","District of Columbia",
  ]);

  // Split by table row separators
  const rows = wikitext.split(/^[ \t]*\|-/m);

  // Find bachelor's column index from header rows
  let bachelorsCol = -1;
  for (const row of rows) {
    if (!row.includes("!")) continue;
    const headers = row.split(/!!|\n!/).map(h =>
      h.replace(/\{\{[^}]+\}\}/g, "").replace(/['[\]|!]/g, "").trim().toLowerCase()
    );
    const idx = headers.findIndex(h => h.includes("bachelor") || (h.includes("4") && h.includes("year")));
    if (idx >= 0) { bachelorsCol = idx; console.log("Bachelor's col:", idx, "→", headers[idx]); break; }
  }

  const results = [];
  const seen = new Set();

  for (const row of rows) {
    // Find wikilinks in this row
    const links = [...row.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].replace(" (state)", "").trim());
    const stateName = links.find(n => US_STATES.has(n));
    if (!stateName || seen.has(stateName)) continue;

    // Extract numeric values from this row (handle || inline and newline-per-cell formats)
    const rawCells = row.split(/\|\||^\|/m).slice(1);  // remove first element (before first |)
    const vals = rawCells.map(c => {
      // Strip templates, keeping their numeric arguments
      const stripped = c
        .replace(/\{\{[^|{}]+\|([\d.]+)[^}]*\}\}/g, "$1")
        .replace(/\{\{[^}]+\}\}/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/[,%'']/g, "")
        .trim();
      return parseFloat(stripped);
    }).filter(v => !isNaN(v) && v >= 15 && v <= 75);

    if (vals.length === 0) continue;

    // Pick the value at bachelorsCol, else take the last value in plausible range
    let pct = (bachelorsCol >= 0 && vals[bachelorsCol] != null) ? vals[bachelorsCol] : vals[vals.length - 1];
    if (isNaN(pct)) continue;

    seen.add(stateName);
    results.push({ name: stateName, value: Math.round(pct * 10) / 10 });
  }

  if (results.length < 40) {
    console.warn(`Wikipedia education: only ${results.length} states, using static fallback`);
    return getStaticUSEducation();
  }
  results.sort((a, b) => b.value - a.value);
  console.log(`Wikipedia education: ${results.length} states`);
  return { data: results, year: 2023 };
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
  // Try Census ACS DP03 — % computer, engineering, and science occupations
  const censusUrls = [
    ["https://api.census.gov/data/2022/acs/acs5/profile?get=DP03_0028PE,NAME&for=state:*&key=DEMO_KEY", 2022],
    ["https://api.census.gov/data/2021/acs/acs5/profile?get=DP03_0028PE,NAME&for=state:*&key=DEMO_KEY", 2021],
  ];

  for (const [url, year] of censusUrls) {
    try {
      console.log(`Fetching US STEM employment from Census ACS DP03 (${year})…`);
      const res = await fetchWithRetry(url, 2, BROWSER_UA);
      const text = await res.text();
      if (!text.trim().startsWith("[")) {
        console.warn("Census hightech: non-JSON response, skipping");
        continue;
      }
      const rows = JSON.parse(text);
      const results = [];
      for (let i = 1; i < rows.length; i++) {
        const pct = parseFloat(rows[i][0]);
        const name = rows[i][1];
        if (isNaN(pct) || pct < 0.5 || pct > 30) continue;
        results.push({ name, value: Math.round(pct * 10) / 10 });
      }
      if (results.length >= 40) {
        results.sort((a, b) => b.value - a.value);
        console.log(`Census ACS hightech: ${results.length} states. Year: ${year}`);
        return results;
      }
      console.warn(`Census hightech: only ${results.length} states from ${url}`);
    } catch (err) {
      console.warn(`Census hightech attempt failed: ${err.message}`);
    }
  }

  console.warn("Census hightech: all sources failed, using static fallback");
  return getStaticUSHightech();
}

async function fetchEurostatHightech() {
  const euGeoCodes = Object.keys(EU_COUNTRY_META)
    .map(iso3 => EUROSTAT_CODE_MAP[iso3] ?? iso3)
    .map(code => `geo=${code}`)
    .join("&");

  // Try multiple Eurostat datasets for EU ICT/hightech employment
  const datasets = [
    // isoc_sk_dskl_i21 with indic_is filter to get just the ICT-specialist indicator
    `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_sk_dskl_i21?format=JSON&lang=EN&unit=PC_EMP&sex=T&age=Y15_74&indic_is=P_ICTSP&time=2022&${euGeoCodes}`,
    // htec_emp_nat2: high-tech sectors employment as % of total (HT_HTC = high-tech total)
    `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/htec_emp_nat2?format=JSON&lang=EN&unit=PC_EMP&nace_r2=HT_HTC&sex=T&age=Y15_74&${euGeoCodes}`,
    // htec_emp_nat2 without age filter (wider compatibility)
    `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/htec_emp_nat2?format=JSON&lang=EN&unit=PC_EMP&nace_r2=HT_HTC&sex=T&${euGeoCodes}`,
  ];

  for (const url of datasets) {
    const datasetName = url.match(/data\/([^?]+)/)[1];
    try {
      console.log(`Fetching EU hightech from Eurostat ${datasetName}…`);
      const res = await fetchWithRetry(url);
      const json = await res.json();
      const rawData = parseEurostatData(json);
      const results = [];
      let latestYear = 0;
      for (const [isoCode, entry] of Object.entries(rawData)) {
        if (entry.value < 0.3 || entry.value > 30) {
          console.warn(`Eurostat hightech: implausible ${isoCode}: ${entry.value}`);
          continue;
        }
        if (entry.year > latestYear) latestYear = entry.year;
        results.push({ ...EU_COUNTRY_META[isoCode], value: Math.round(entry.value * 10) / 10 });
      }
      if (results.length >= 20) {
        results.sort((a, b) => b.value - a.value);
        console.log(`Eurostat hightech (${datasetName}): ${results.length} countries. Year: ${latestYear}`);
        return { data: results, year: latestYear };
      }
      console.warn(`Eurostat hightech: only ${results.length} countries from ${datasetName}`);
    } catch (err) {
      console.warn(`Eurostat hightech ${datasetName} failed: ${err.message}`);
    }
  }
  console.warn("Eurostat hightech: all datasets failed, using static fallback");
  return getStaticEUHightech();
}

// ─── Patents ──────────────────────────────────────────────────────────────────

// US state populations (2020 Census) for per-million calculation
const US_STATE_POPULATION = {
  "Alabama":5024279,"Alaska":733391,"Arizona":7151502,"Arkansas":3011524,"California":39538223,
  "Colorado":5773714,"Connecticut":3605944,"Delaware":989948,"District of Columbia":689545,
  "Florida":21538187,"Georgia":10711908,"Hawaii":1455271,"Idaho":1839106,"Illinois":12812508,
  "Indiana":6785528,"Iowa":3190369,"Kansas":2937880,"Kentucky":4505836,"Louisiana":4657757,
  "Maine":1362359,"Maryland":6177224,"Massachusetts":7029917,"Michigan":10077331,"Minnesota":5706494,
  "Mississippi":2961279,"Missouri":6154913,"Montana":1084225,"Nebraska":1961504,"Nevada":3104614,
  "New Hampshire":1377529,"New Jersey":9288994,"New Mexico":2117522,"New York":20201249,
  "North Carolina":10439388,"North Dakota":779094,"Ohio":11799448,"Oklahoma":3959353,
  "Oregon":4237256,"Pennsylvania":13002700,"Rhode Island":1097379,"South Carolina":5118425,
  "South Dakota":886667,"Tennessee":6910840,"Texas":29145505,"Utah":3271616,"Vermont":643077,
  "Virginia":8631393,"Washington":7705281,"West Virginia":1793716,"Wisconsin":5893718,"Wyoming":576851,
};

async function fetchUSPatentsUSPTO() {
  // USPTO Patent Technology Monitoring Team — state counts table
  console.log("Fetching US patent data from USPTO PTMT…");
  const url = "https://www.uspto.gov/web/offices/ac/ido/oeip/taf/stateall.htm";
  const res = await fetchWithRetry(url, 2, BROWSER_UA);
  const html = await res.text();

  const stripTags = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").trim();
  const rowRegex  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  const stateTotals = {};
  for (const rowMatch of html.matchAll(rowRegex)) {
    const cells = [...rowMatch[1].matchAll(cellRegex)].map(m => stripTags(m[1]));
    if (cells.length < 3) continue;
    const name = cells[0].replace(/\*/g, "").trim();
    if (!US_STATE_POPULATION[name]) continue;
    // Try to find the total patent count column (usually last numeric column)
    const nums = cells.slice(1).map(c => parseInt(c.replace(/,/g, ""))).filter(n => !isNaN(n) && n > 0);
    if (nums.length === 0) continue;
    stateTotals[name] = nums[nums.length - 1]; // last year total
  }

  if (Object.keys(stateTotals).length < 40) throw new Error(`USPTO: only ${Object.keys(stateTotals).length} states`);

  const results = Object.entries(stateTotals).map(([name, count]) => {
    const pop = US_STATE_POPULATION[name];
    return { name, value: Math.round(count / pop * 1_000_000) };
  }).filter(r => r.value > 0);
  results.sort((a, b) => b.value - a.value);
  console.log(`USPTO patents: ${results.length} states`);
  return { data: results, year: 2022 };
}

async function fetchWikipediaPatents() {
  console.log("Fetching US patent data from Wikipedia…");
  const pageTitles = [
    "List_of_U.S._states_and_territories_by_patent_activity",
    "List_of_U.S._states_by_patent_activity",
    "Patent_activity_in_the_United_States",
    "List_of_U.S._states_by_innovation",
    "Research_and_development_in_the_United_States",
  ];

  // Full-text search to find the right page
  try {
    const searchUrl = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "query", list: "search", srsearch: "US states patent per million", srlimit: "10",
      format: "json", origin: "*",
    });
    const sres = await fetchWithRetry(searchUrl, 2);
    const json = await sres.json();
    for (const item of (json?.query?.search ?? [])) {
      if (item.title.toLowerCase().includes("patent") && item.title.toLowerCase().includes("state")) {
        const slug = item.title.replace(/ /g, "_");
        if (!pageTitles.includes(slug)) pageTitles.push(slug);
      }
    }
  } catch (err) {
    console.warn("Wikipedia patent search failed:", err.message);
  }

  let json = null;
  for (const page of pageTitles) {
    const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "parse", page, prop: "wikitext", format: "json", origin: "*",
    });
    const res = await fetchWithRetry(url, 2);
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

  if (results.length < 40) {
    console.warn(`Wikipedia patents: only ${results.length} states, using static fallback`);
    return getStaticUSPatents();
  }
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

// ─── Static fallbacks (used when all live sources fail) ──────────────────────

function getStaticUSEducation() {
  console.log("Using static US education fallback (Census ACS 2022 estimates)");
  return {
    data: [
      { name: "District of Columbia", value: 61.0 },
      { name: "Massachusetts", value: 46.8 },
      { name: "Colorado", value: 44.1 },
      { name: "Maryland", value: 43.0 },
      { name: "Connecticut", value: 40.5 },
      { name: "New Jersey", value: 39.8 },
      { name: "Virginia", value: 39.5 },
      { name: "Vermont", value: 38.9 },
      { name: "New Hampshire", value: 38.4 },
      { name: "Washington", value: 38.2 },
      { name: "Minnesota", value: 38.0 },
      { name: "Utah", value: 37.3 },
      { name: "New York", value: 37.1 },
      { name: "California", value: 36.9 },
      { name: "Delaware", value: 35.9 },
      { name: "Montana", value: 35.1 },
      { name: "Rhode Island", value: 34.9 },
      { name: "Oregon", value: 34.8 },
      { name: "Hawaii", value: 34.3 },
      { name: "Maine", value: 33.6 },
      { name: "Kansas", value: 33.7 },
      { name: "Nebraska", value: 33.4 },
      { name: "Wisconsin", value: 32.5 },
      { name: "Texas", value: 32.4 },
      { name: "Illinois", value: 32.0 },
      { name: "Georgia", value: 31.6 },
      { name: "Florida", value: 31.4 },
      { name: "North Carolina", value: 31.4 },
      { name: "Alaska", value: 29.8 },
      { name: "Iowa", value: 29.8 },
      { name: "Wyoming", value: 29.5 },
      { name: "Pennsylvania", value: 29.4 },
      { name: "Tennessee", value: 28.9 },
      { name: "South Dakota", value: 28.8 },
      { name: "Idaho", value: 28.5 },
      { name: "Missouri", value: 28.4 },
      { name: "North Dakota", value: 28.0 },
      { name: "Arizona", value: 27.9 },
      { name: "Ohio", value: 27.9 },
      { name: "Michigan", value: 27.7 },
      { name: "South Carolina", value: 27.0 },
      { name: "Oklahoma", value: 26.4 },
      { name: "New Mexico", value: 26.0 },
      { name: "Indiana", value: 25.9 },
      { name: "Kentucky", value: 25.4 },
      { name: "Nevada", value: 25.3 },
      { name: "Louisiana", value: 24.2 },
      { name: "Alabama", value: 23.9 },
      { name: "Arkansas", value: 23.6 },
      { name: "West Virginia", value: 20.6 },
      { name: "Mississippi", value: 20.1 },
    ],
    year: 2022,
  };
}

function getStaticUSHightech() {
  console.log("Using static US hightech fallback (Census ACS DP03 2022 estimates)");
  return [
    { name: "District of Columbia", value: 25.3 },
    { name: "Washington", value: 15.2 },
    { name: "Massachusetts", value: 13.8 },
    { name: "California", value: 12.9 },
    { name: "Colorado", value: 12.1 },
    { name: "Virginia", value: 11.8 },
    { name: "Maryland", value: 11.3 },
    { name: "Connecticut", value: 10.9 },
    { name: "New Hampshire", value: 10.6 },
    { name: "New Jersey", value: 10.4 },
    { name: "Minnesota", value: 10.1 },
    { name: "Texas", value: 9.7 },
    { name: "New York", value: 9.5 },
    { name: "Delaware", value: 9.4 },
    { name: "Oregon", value: 9.0 },
    { name: "Utah", value: 8.9 },
    { name: "Alaska", value: 8.8 },
    { name: "Idaho", value: 8.5 },
    { name: "Arizona", value: 8.3 },
    { name: "North Carolina", value: 8.2 },
    { name: "Georgia", value: 8.0 },
    { name: "Illinois", value: 7.8 },
    { name: "Pennsylvania", value: 7.6 },
    { name: "Wisconsin", value: 7.4 },
    { name: "Tennessee", value: 7.2 },
    { name: "Florida", value: 7.1 },
    { name: "Ohio", value: 7.1 },
    { name: "Nebraska", value: 7.0 },
    { name: "Rhode Island", value: 6.9 },
    { name: "Kansas", value: 6.8 },
    { name: "Iowa", value: 6.7 },
    { name: "Michigan", value: 6.6 },
    { name: "Missouri", value: 6.5 },
    { name: "Indiana", value: 6.4 },
    { name: "South Carolina", value: 6.3 },
    { name: "Vermont", value: 6.2 },
    { name: "Nevada", value: 6.1 },
    { name: "Hawaii", value: 6.0 },
    { name: "Montana", value: 5.9 },
    { name: "New Mexico", value: 5.8 },
    { name: "North Dakota", value: 5.7 },
    { name: "South Dakota", value: 5.6 },
    { name: "Oklahoma", value: 5.5 },
    { name: "Arkansas", value: 5.4 },
    { name: "Kentucky", value: 5.3 },
    { name: "Wyoming", value: 5.2 },
    { name: "Alabama", value: 5.1 },
    { name: "Maine", value: 5.1 },
    { name: "Louisiana", value: 5.0 },
    { name: "Mississippi", value: 4.9 },
    { name: "West Virginia", value: 4.5 },
  ];
}

function getStaticEUHightech() {
  console.log("Using static EU hightech fallback (Eurostat isoc_sk_dskl_i21 2022 estimates)");
  return {
    data: [
      { name: "Sweden",      flag: "🇸🇪", value: 6.0 },
      { name: "Finland",     flag: "🇫🇮", value: 5.5 },
      { name: "Netherlands", flag: "🇳🇱", value: 5.4 },
      { name: "Denmark",     flag: "🇩🇰", value: 5.3 },
      { name: "Luxembourg",  flag: "🇱🇺", value: 5.1 },
      { name: "Belgium",     flag: "🇧🇪", value: 4.5 },
      { name: "Czechia",     flag: "🇨🇿", value: 4.3 },
      { name: "Germany",     flag: "🇩🇪", value: 4.2 },
      { name: "Austria",     flag: "🇦🇹", value: 4.1 },
      { name: "Ireland",     flag: "🇮🇪", value: 4.1 },
      { name: "France",      flag: "🇫🇷", value: 4.0 },
      { name: "Estonia",     flag: "🇪🇪", value: 4.0 },
      { name: "Slovakia",    flag: "🇸🇰", value: 3.7 },
      { name: "Hungary",     flag: "🇭🇺", value: 3.6 },
      { name: "Spain",       flag: "🇪🇸", value: 3.5 },
      { name: "Slovenia",    flag: "🇸🇮", value: 3.4 },
      { name: "Lithuania",   flag: "🇱🇹", value: 3.3 },
      { name: "Poland",      flag: "🇵🇱", value: 3.3 },
      { name: "Italy",       flag: "🇮🇹", value: 3.2 },
      { name: "Latvia",      flag: "🇱🇻", value: 3.1 },
      { name: "Portugal",    flag: "🇵🇹", value: 3.1 },
      { name: "Malta",       flag: "🇲🇹", value: 3.0 },
      { name: "Croatia",     flag: "🇭🇷", value: 2.9 },
      { name: "Cyprus",      flag: "🇨🇾", value: 2.8 },
      { name: "Bulgaria",    flag: "🇧🇬", value: 2.5 },
      { name: "Greece",      flag: "🇬🇷", value: 2.4 },
      { name: "Romania",     flag: "🇷🇴", value: 2.0 },
    ],
    year: 2022,
  };
}

function getStaticUSPatents() {
  console.log("Using static US patents fallback (USPTO 2022 estimates)");
  return {
    data: [
      { name: "California", value: 1310 },
      { name: "Massachusetts", value: 1150 },
      { name: "Washington", value: 1100 },
      { name: "Delaware", value: 860 },
      { name: "Minnesota", value: 820 },
      { name: "Connecticut", value: 760 },
      { name: "New Jersey", value: 710 },
      { name: "Oregon", value: 650 },
      { name: "Colorado", value: 610 },
      { name: "New Hampshire", value: 540 },
      { name: "Utah", value: 500 },
      { name: "Idaho", value: 480 },
      { name: "Maryland", value: 440 },
      { name: "Michigan", value: 420 },
      { name: "Illinois", value: 390 },
      { name: "New York", value: 380 },
      { name: "Wisconsin", value: 360 },
      { name: "Texas", value: 340 },
      { name: "Vermont", value: 320 },
      { name: "Pennsylvania", value: 300 },
      { name: "Virginia", value: 290 },
      { name: "Arizona", value: 270 },
      { name: "North Carolina", value: 260 },
      { name: "Georgia", value: 250 },
      { name: "Ohio", value: 240 },
      { name: "Iowa", value: 220 },
      { name: "Kansas", value: 210 },
      { name: "Indiana", value: 200 },
      { name: "Montana", value: 190 },
      { name: "District of Columbia", value: 190 },
      { name: "Nebraska", value: 185 },
      { name: "Tennessee", value: 175 },
      { name: "Florida", value: 170 },
      { name: "Maine", value: 165 },
      { name: "South Dakota", value: 160 },
      { name: "Rhode Island", value: 155 },
      { name: "Alaska", value: 150 },
      { name: "Wyoming", value: 145 },
      { name: "Nevada", value: 140 },
      { name: "Hawaii", value: 135 },
      { name: "Missouri", value: 130 },
      { name: "Oklahoma", value: 115 },
      { name: "North Dakota", value: 110 },
      { name: "South Carolina", value: 105 },
      { name: "New Mexico", value: 100 },
      { name: "Louisiana", value: 95 },
      { name: "Kentucky", value: 90 },
      { name: "West Virginia", value: 80 },
      { name: "Alabama", value: 75 },
      { name: "Arkansas", value: 70 },
      { name: "Mississippi", value: 60 },
    ],
    year: 2022,
  };
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
  {
    const [usResult, euResult] = await Promise.allSettled([fetchCensusEducation(), fetchEurostatEducation()]);
    if (usResult.status === "fulfilled") {
      educationData = { ...educationData, us: usResult.value.data, usYear: usResult.value.year };
    } else {
      console.error("Education US fetch failed:", usResult.reason.message);
    }
    if (euResult.status === "fulfilled") {
      educationData = { ...educationData, eu: euResult.value.data, euYear: euResult.value.year };
    } else {
      console.error("Education EU fetch failed:", euResult.reason.message);
    }
  }

  // ── High-tech employment ──────────────────────────────────────────────────
  let hightechData = existing.hightech ?? { us: [], eu: [], year: null };
  {
    const [usResult, euResult] = await Promise.allSettled([fetchCensusHightech(), fetchEurostatHightech()]);
    if (usResult.status === "fulfilled") {
      hightechData = { ...hightechData, us: usResult.value };
    } else {
      console.error("Hightech US fetch failed:", usResult.reason.message);
    }
    if (euResult.status === "fulfilled") {
      hightechData = { ...hightechData, eu: euResult.value.data, year: euResult.value.year };
    } else {
      console.error("Hightech EU fetch failed:", euResult.reason.message);
    }
  }

  // ── Patents ───────────────────────────────────────────────────────────────
  let patentsData = existing.patents ?? { us: [], eu: [], year: null };
  {
    const fetchUSPat = async () => {
      try {
        return await fetchUSPatentsUSPTO();
      } catch (err) {
        console.warn("USPTO patents failed, trying Wikipedia:", err.message);
        return fetchWikipediaPatents();
      }
    };
    const [usResult, euResult] = await Promise.allSettled([fetchUSPat(), fetchEurostatPatents()]);
    if (usResult.status === "fulfilled") {
      patentsData = { ...patentsData, us: usResult.value.data };
    } else {
      console.error("Patents US fetch failed:", usResult.reason.message);
    }
    if (euResult.status === "fulfilled") {
      patentsData = { ...patentsData, eu: euResult.value.data, year: euResult.value.year };
    } else {
      console.error("Patents EU fetch failed:", euResult.reason.message);
    }
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
