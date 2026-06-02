/**
 * fetch-data.js
 *
 * US state GDP per capita: Wikipedia API (structured JSON, no scraping)
 * European GDP per capita PPP: IMF DataMapper API
 *
 * No API keys required. Fully automated.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = attempt * 3000;
      console.warn(`Attempt ${attempt} failed (${err.message}). Retrying in ${wait / 1000}s…`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

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

async function fetchWikipediaStates() {
  console.log("Fetching US state GDP per capita from Wikipedia API...");

  // Use the Wikipedia API to get the page content as parsed sections JSON.
  // This gives us structured table data rather than raw wikitext.
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "parse",
    page: "List_of_U.S._states_and_territories_by_GDP",
    prop: "sections|wikitext",
    format: "json",
    origin: "*",
  });

  const res = await fetchWithRetry(url);
  const json = await res.json();
  const wikitext = json.parse.wikitext["*"];

  // Parse the main state table using the Wikipedia API's structured wikitext.
  // Each row follows the pattern: | [[State name]] || ... || $XX,XXX || $XX,XXX || ...
  // The per capita columns are the only ones matching $\d{2,3},\d{3}
  // We target rows with a wikilinked state name and extract the most recent per capita value.

  const results = [];
  let dataYear = null;

  // Extract the year from the table caption or surrounding text
  const yearMatch = wikitext.match(/as of (\d{4})/i) || wikitext.match(/GDP.*?(\d{4})/);
  if (yearMatch) dataYear = yearMatch[1];

  // Split into table rows
  const rowPattern = /\|\s*\[\[([^\]|]+?)(?:\|[^\]]*)?\]\][^\n]*\n(?:[^|{][^\n]*\n)*(?=\|-|\|})/g;

  // Simpler and more reliable: scan line by line for state name + per capita values
  const lines = wikitext.split("\n");
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match a line that starts a state row: | [[StateName]] or | [[StateName|...]]
    const stateMatch = line.match(/^\|\s*\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/);
    if (!stateMatch) continue;

    let stateName = stateMatch[1]
      .replace("Washington (state)", "Washington")
      .replace(" (state)", "")
      .trim();

    if (stateName === "United States" || seen.has(stateName)) continue;

    // Collect all $XX,XXX values from this line and the next few lines
    const context = lines.slice(i, i + 6).join(" ");
    const perCapitaMatches = [...context.matchAll(/\$\s*([\d,]{5,7})/g)];

    if (perCapitaMatches.length === 0) continue;

    // Take the last match -- that's the most recent year's per capita
    const raw = perCapitaMatches[perCapitaMatches.length - 1][1].replace(/,/g, "");
    const gdp = parseInt(raw);

    if (isNaN(gdp) || gdp < 10000 || gdp > 500000) continue;

    seen.add(stateName);
    const entry = { name: stateName, gdp };
    if (stateName === "District of Columbia") entry.note = "Federal district";
    results.push(entry);
  }

  if (results.length < 45) {
    throw new Error(`Only parsed ${results.length} states -- Wikipedia table structure may have changed`);
  }

  results.sort((a, b) => b.gdp - a.gdp);
  console.log(`Wikipedia parse complete. ${results.length} states. Year: ${dataYear}`);
  return { data: results, year: dataYear || new Date().getFullYear() - 1 };
}

async function fetchIMF() {
  const codes = Object.keys(EU_COUNTRY_META).join("/");
  const url = `https://www.imf.org/external/datamapper/api/v1/PPPPC/${codes}`;
  console.log("Fetching IMF European data...");

  const res = await fetchWithRetry(url);
  const json = await res.json();

  const results = [];
  let latestYear = 0;

  for (const [code, meta] of Object.entries(EU_COUNTRY_META)) {
    const values = json?.values?.PPPPC?.[code];
    if (!values) {
      console.warn(`No IMF data for ${code}, skipping`);
      continue;
    }
    const years = Object.keys(values).map(Number).sort((a, b) => b - a);
    const year = years[0];
    const gdp = Math.round(values[year]);
    if (year > latestYear) latestYear = year;
    results.push({ ...meta, gdp });
  }

  results.sort((a, b) => b.gdp - a.gdp);
  console.log(`IMF fetch complete. Latest year: ${latestYear}. ${results.length} countries.`);
  return { data: results, year: latestYear };
}

function formatStateArray(states) {
  return states.map(s => {
    const note = s.note ? `, note: "${s.note}"` : "";
    return `  { name: "${s.name}", gdp: ${s.gdp}${note} }`;
  }).join(",\n");
}

function formatEUArray(countries) {
  return countries.map(c => {
    const note = c.note ? `, note: "${c.note}"` : "";
    return `  { name: "${c.name}", gdp: ${c.gdp}, flag: "${c.flag}"${note} }`;
  }).join(",\n");
}

async function main() {
  const [wiki, imf] = await Promise.all([fetchWikipediaStates(), fetchIMF()]);

  const appPath = path.join(__dirname, "../src/App.jsx");
  let src = fs.readFileSync(appPath, "utf8");

  src = src.replace(
    /const US_STATES = \[[\s\S]*?\];/,
    `const US_STATES = [\n${formatStateArray(wiki.data)},\n];`
  );

  src = src.replace(
    /const EU_COUNTRIES = \[[\s\S]*?\];/,
    `const EU_COUNTRIES = [\n${formatEUArray(imf.data)},\n];`
  );

  src = src.replace(/BEA \d{4}/g, `BEA ${wiki.year}`);
  src = src.replace(/IMF WEO April \d{4}/g, `IMF WEO April ${imf.year}`);
  src = src.replace(/\(IMF, \d{4}\)/g, `(IMF, ${imf.year})`);
  src = src.replace(
    /\/\/ US States.*\n/,
    `// US States - Nominal GDP per capita ${wiki.year} (BEA via Wikipedia)\n`
  );
  src = src.replace(
    /\/\/ European countries.*\n/,
    `// European countries - GDP per capita PPP ${imf.year} (IMF WEO April ${imf.year})\n`
  );

  fs.writeFileSync(appPath, src, "utf8");

  const dataDir = path.join(__dirname, "../data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  fs.writeFileSync(
    path.join(dataDir, "gdp.json"),
    JSON.stringify({
      updated: new Date().toISOString().slice(0, 10),
      us: { year: wiki.year, data: wiki.data },
      europe: { year: imf.year, data: imf.data },
    }, null, 2),
    "utf8"
  );

  console.log(`Done. US: BEA ${wiki.year} via Wikipedia. Europe: IMF ${imf.year}.`);
}

main().catch(err => {
  console.error("fetch-data.js failed:", err);
  process.exit(1);
});
