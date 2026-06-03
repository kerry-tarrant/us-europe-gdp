/**
 * fetch-data.js
 *
 * Fetches three metrics for US states and European countries:
 *   1. GDP per capita          — Wikipedia (US) + IMF DataMapper (EU)
 *   2. Electricity per capita  — EIA SEDS HTML table (US) + Eurostat nrg_ind_use + demo_pjan (EU)
 *   3. Median household income — Census ACS (US) + Eurostat ilc_di03 (EU)
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

// PPS → USD conversion rate (approximate; 1 PPS ≈ 1 EUR ≈ 1.07 USD as of 2023)
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
 * Returns a map of { [isoCode]: { value, year } } for the latest available year per country.
 * preferredDimValues: hint for non-geo/time dimensions, e.g. { unit: "GWH", nrg_bal: "FC_E" }
 */
function parseEurostatData(json, preferredDimValues = {}) {
  const dims  = json.id;
  const sizes = json.size;
  const dimInfo = json.dimension;

  const geoIdx  = dims.indexOf("geo");
  const timeIdx = dims.indexOf("time");
  if (geoIdx === -1 || timeIdx === -1) throw new Error("Eurostat: missing geo or time dimension");

  // Build per-dimension strides for flat-index calculation
  const strides = new Array(dims.length).fill(0);
  strides[dims.length - 1] = 1;
  for (let i = dims.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const geoCodes  = dimInfo.geo.category.index;
  const timeCodes = dimInfo.time.category.index;
  const years = Object.keys(timeCodes).map(Number).sort((a, b) => b - a); // newest first

  const result = {};

  for (const [isoCode, meta] of Object.entries(EU_COUNTRY_META)) {
    const geoPos = geoCodes[isoCode];
    if (geoPos === undefined) continue;

    for (const year of years) {
      const timePos = timeCodes[String(year)];
      if (timePos === undefined) continue;

      // For each non-geo/time dimension: use preferred value, then try all available positions
      const otherDims = dims
        .map((dim, i) => ({ dim, i }))
        .filter(({ dim }) => dim !== "geo" && dim !== "time");

      // Collect candidate positions for each other dimension
      const dimOptions = otherDims.map(({ dim, i }) => {
        const codes = dimInfo[dim]?.category?.index ?? {};
        const preferred = preferredDimValues[dim];
        if (preferred !== undefined && codes[preferred] !== undefined) {
          return [codes[preferred]];
        }
        return Object.values(codes); // try all
      });

      // Iterate through combinations (limited to avoid explosion)
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
      "Puerto Rico":             "Commonwealth",
      "Guam":                    "Territory",
      "U.S. Virgin Islands":     "Territory",
      "Northern Mariana Islands":"Commonwealth",
      "American Samoa":          "Territory",
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
  console.log("Fetching US electricity per capita from EIA SEDS…");
  // Fetch the ranking table HTML directly
  const url = "https://www.eia.gov/state/seds/sep_sum/html/rank_es_capita.html";
  const res = await fetchWithRetry(url);
  const html = await res.text();

  const results = [];
  // Each data row: <tr><td>rank</td><td><a ...>State Name</a></td><td>value</td>...</tr>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripTags = s => s.replace(/<[^>]+>/g, "").trim();

  for (const rowMatch of html.matchAll(rowRegex)) {
    const cells = [...rowMatch[1].matchAll(cellRegex)].map(m => stripTags(m[1]));
    if (cells.length < 3) continue;

    // Expected: [rank, state_name, kWh_value, ...]
    const rank = parseInt(cells[0]);
    if (isNaN(rank) || rank < 1 || rank > 60) continue;

    const name = cells[1].replace(/\*+$/, "").trim();
    const raw  = cells[2].replace(/,/g, "").trim();
    const value = parseInt(raw);

    if (!name || isNaN(value) || value < 1000 || value > 100000) continue;
    results.push({ name, value });
  }

  if (results.length < 40) throw new Error(`EIA: only parsed ${results.length} states`);
  results.sort((a, b) => b.value - a.value);
  console.log(`EIA: ${results.length} states`);
  return results;
}

async function fetchEurostatElectricity() {
  console.log("Fetching EU electricity consumption from Eurostat nrg_ind_use…");
  // Fetch total final electricity consumption (GWH) for all available countries
  const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_ind_use" +
    "?format=JSON&lang=EN&nrg_bal=FC_E&siec=E7000&unit=GWH";
  const res = await fetchWithRetry(url);
  const json = await res.json();

  const rawData = parseEurostatData(json, { unit: "GWH", nrg_bal: "FC_E", siec: "E7000" });

  // Also fetch population to convert GWH → kWh per capita
  console.log("Fetching EU population from Eurostat demo_pjan…");
  const popUrl = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_pjan" +
    "?format=JSON&lang=EN&sex=T&age=TOTAL";
  const popRes = await fetchWithRetry(popUrl);
  const popJson = await popRes.json();
  const popData = parseEurostatData(popJson, { sex: "T", age: "TOTAL" });

  const results = [];
  let latestYear = 0;

  for (const [isoCode, entry] of Object.entries(rawData)) {
    const pop = popData[isoCode];
    if (!pop || !pop.value) { console.warn(`Eurostat elec: no population for ${isoCode}`); continue; }

    // entry.value is in GWH; pop.value is in persons (demo_pjan uses actual count)
    // kWh per capita = GWH * 1_000_000 / population
    const kwhPerCapita = Math.round((entry.value * 1_000_000) / pop.value);
    if (kwhPerCapita < 100 || kwhPerCapita > 100_000) {
      console.warn(`Eurostat elec: implausible value for ${isoCode}: ${kwhPerCapita} kWh`);
      continue;
    }

    if (entry.year > latestYear) latestYear = entry.year;
    results.push({ ...EU_COUNTRY_META[isoCode], value: kwhPerCapita });
  }

  results.sort((a, b) => b.value - a.value);
  console.log(`Eurostat electricity: ${results.length} countries. Year: ${latestYear}`);
  return { data: results, year: latestYear };
}

// ─── Income ───────────────────────────────────────────────────────────────────

async function fetchCensusIncome() {
  console.log("Fetching US median household income from Census ACS…");
  // `for=state:*` covers the 50 states + DC but not territories.
  // Puerto Rico (FIPS 72) is fetched separately; other territories lack ACS coverage.
  const [resStates, resPR] = await Promise.all([
    fetchWithRetry("https://api.census.gov/data/2023/acs/acs1?get=NAME,B19013_001E&for=state:*"),
    fetchWithRetry("https://api.census.gov/data/2023/acs/acs1?get=NAME,B19013_001E&for=state:72"),
  ]);

  const allRows = [
    ...(await resStates.json()).slice(1),
    ...(await resPR.json()).slice(1),
  ];

  const results = [];
  for (const row of allRows) {
    const [name, incomeStr] = row;
    const value = parseInt(incomeStr);
    if (isNaN(value) || value <= 0) continue;
    results.push({ name: name.replace(/, .*$/, "").trim(), value });
  }

  results.sort((a, b) => b.value - a.value);
  console.log(`Census: ${results.length} states/territories`);
  return results;
}

async function fetchEurostatIncome() {
  console.log("Fetching EU median income from Eurostat ilc_di03…");
  // Median equivalised net income in PPS
  const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ilc_di03" +
    "?format=JSON&lang=EN&indic_il=MED_E&currency=PPS";
  const res = await fetchWithRetry(url);
  const json = await res.json();

  const rawData = parseEurostatData(json, { indic_il: "MED_E", currency: "PPS" });

  const results = [];
  let latestYear = 0;

  for (const [isoCode, entry] of Object.entries(rawData)) {
    // Convert PPS to USD
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
  // Load existing data.json so we can preserve any metric that fails to fetch
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
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
    const [usIncome, euIncome] = await Promise.all([fetchCensusIncome(), fetchEurostatIncome()]);
    incomeData = { us: usIncome, eu: euIncome.data, usYear: 2023, euYear: euIncome.year };
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
