/**
 * fetch-data.js
 *
 * Fetches US state GDP per capita from Wikipedia (no key required)
 * Fetches European GDP per capita PPP from IMF DataMapper API (no key required)
 * Rewrites src/App.jsx with updated data and year labels.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  console.log("Fetching US state GDP per capita from Wikipedia...");

  const url = "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_U.S._states_and_territories_by_GDP&prop=wikitext&format=json&origin=*";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia API returned ${res.status}`);
  const json = await res.json();
  const wikitext = json.parse.wikitext["*"];

  // The per capita column is the 4th data column in the main table.
  // Each state row looks like: | [[State]] || ... || $117,332 || ...
  // We parse every row that has a dollar-formatted per capita figure.

  const stateRows = [];
  const lines = wikitext.split("\n");

  // Find the main GDP table rows
  let inTable = false;
  let currentState = null;
  let colIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("|-")) {
      currentState = null;
      colIndex = 0;
      inTable = true;
      continue;
    }

    if (!inTable) continue;

    // Row starts with | or ||
    if (line.startsWith("|") && !line.startsWith("|-") && !line.startsWith("|+")) {
      // Split by || to get columns
      const cols = line.replace(/^\|/, "").split("||").map(c => c.trim());

      // First column: state name (may contain wikilink like [[California]])
      const nameMatch = cols[0].match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
      if (nameMatch) {
        currentState = nameMatch[1].replace(" (state)", "").replace("Washington (state)", "Washington");
        // Handle DC
        if (currentState === "District of Columbia") currentState = "District of Columbia";
      }

      // Look for per capita column - it's the one matching $XX,XXX format
      // In this table structure the per capita 2024 value is the last $-formatted value
      const perCapitaCols = cols.filter(c => /^\$[\d,]+$/.test(c.replace(/['']/g, "")));
      if (currentState && perCapitaCols.length >= 1) {
        // Take the last one (2024 value, not 2023)
        const raw = perCapitaCols[perCapitaCols.length - 1].replace(/[\$,'']/g, "");
        const gdp = parseInt(raw);
        if (!isNaN(gdp) && gdp > 10000) {
          // Skip US total row
          if (currentState !== "United States") {
            stateRows.push({ name: currentState, gdp });
          }
        }
      }
    }
  }

  if (stateRows.length < 40) {
    throw new Error(`Only parsed ${stateRows.length} states from Wikipedia -- something changed in the table format`);
  }

  // Add DC note
  const result = stateRows.map(s => {
    if (s.name === "District of Columbia") return { ...s, note: "Federal district" };
    return s;
  });

  result.sort((a, b) => b.gdp - a.gdp);

  // Extract year from wikitext
  const yearMatch = wikitext.match(/GDP per capita.*?(\d{4})/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear() - 1;

  console.log(`Wikipedia parse complete. ${result.length} states. Year: ${year}`);
  return { data: result, year };
}

async function fetchIMF() {
  const codes = Object.keys(EU_COUNTRY_META).join("/");
  const url = `https://www.imf.org/external/datamapper/api/v1/PPPPC/${codes}`;
  console.log("Fetching IMF European data...");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`IMF API returned ${res.status}`);
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
  console.log(`App.jsx updated. US states: BEA ${wiki.year} via Wikipedia. Europe: IMF ${imf.year}.`);
}

main().catch(err => {
  console.error("fetch-data.js failed:", err);
  process.exit(1);
});
