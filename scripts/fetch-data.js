/**
 * fetch-data.js
 *
 * Fetches the latest GDP per capita data from:
 *   - BEA Regional API (US states, nominal, most recent annual year)
 *   - IMF DataMapper API (European countries, PPP, most recent year)
 *
 * Then rewrites src/App.jsx with updated data arrays and source year labels.
 *
 * Requires env var: BEA_API_KEY
 * Get a free key at: https://apps.bea.gov/api/signup/
 */

const fs = require("fs");
const path = require("path");

const BEA_API_KEY = process.env.BEA_API_KEY;
if (!BEA_API_KEY) {
  console.error("BEA_API_KEY environment variable is not set.");
  process.exit(1);
}

// European countries we care about, keyed by IMF country code
const EU_COUNTRY_META = {
  IRL: { name: "Ireland",        flag: "🇮🇪", note: "Inflated by multinationals" },
  LUX: { name: "Luxembourg",     flag: "🇱🇺" },
  NOR: { name: "Norway",         flag: "🇳🇴" },
  CHE: { name: "Switzerland",    flag: "🇨🇭" },
  DNK: { name: "Denmark",        flag: "🇩🇰" },
  NLD: { name: "Netherlands",    flag: "🇳🇱" },
  SMR: { name: "San Marino",     flag: "🇸🇲" },
  ISL: { name: "Iceland",        flag: "🇮🇸" },
  MLT: { name: "Malta",          flag: "🇲🇹" },
  BEL: { name: "Belgium",        flag: "🇧🇪" },
  AUT: { name: "Austria",        flag: "🇦🇹" },
  SWE: { name: "Sweden",         flag: "🇸🇪" },
  DEU: { name: "Germany",        flag: "🇩🇪" },
  AND: { name: "Andorra",        flag: "🇦🇩" },
  FIN: { name: "Finland",        flag: "🇫🇮" },
  FRA: { name: "France",         flag: "🇫🇷" },
  CYP: { name: "Cyprus",         flag: "🇨🇾" },
  GBR: { name: "United Kingdom", flag: "🇬🇧" },
  ITA: { name: "Italy",          flag: "🇮🇹" },
  CZE: { name: "Czechia",        flag: "🇨🇿" },
  LTU: { name: "Lithuania",      flag: "🇱🇹" },
  SVN: { name: "Slovenia",       flag: "🇸🇮" },
  ESP: { name: "Spain",          flag: "🇪🇸" },
  POL: { name: "Poland",         flag: "🇵🇱" },
  HRV: { name: "Croatia",        flag: "🇭🇷" },
  PRT: { name: "Portugal",       flag: "🇵🇹" },
  EST: { name: "Estonia",        flag: "🇪🇪" },
  ROU: { name: "Romania",        flag: "🇷🇴" },
  HUN: { name: "Hungary",        flag: "🇭🇺" },
  SVK: { name: "Slovakia",       flag: "🇸🇰" },
  GRC: { name: "Greece",         flag: "🇬🇷" },
  LVA: { name: "Latvia",         flag: "🇱🇻" },
  BGR: { name: "Bulgaria",       flag: "🇧🇬" },
  MNE: { name: "Montenegro",     flag: "🇲🇪" },
  SRB: { name: "Serbia",         flag: "🇷🇸" },
  MKD: { name: "North Macedonia",flag: "🇲🇰" },
  BIH: { name: "Bosnia & Herz.", flag: "🇧🇦" },
  ALB: { name: "Albania",        flag: "🇦🇱" },
  XKX: { name: "Kosovo",         flag: "🇽🇰" },
  MDA: { name: "Moldova",        flag: "🇲🇩" },
  UKR: { name: "Ukraine",        flag: "🇺🇦" },
};

// BEA state GeoFIPS codes -> state names
const BEA_STATE_NAMES = {
  "01000": "Alabama",       "02000": "Alaska",         "04000": "Arizona",
  "05000": "Arkansas",      "06000": "California",     "08000": "Colorado",
  "09000": "Connecticut",   "10000": "Delaware",       "11000": "District of Columbia",
  "12000": "Florida",       "13000": "Georgia",        "15000": "Hawaii",
  "16000": "Idaho",         "17000": "Illinois",       "18000": "Indiana",
  "19000": "Iowa",          "20000": "Kansas",         "21000": "Kentucky",
  "22000": "Louisiana",     "23000": "Maine",          "24000": "Maryland",
  "25000": "Massachusetts", "26000": "Michigan",       "27000": "Minnesota",
  "28000": "Mississippi",   "29000": "Missouri",       "30000": "Montana",
  "31000": "Nebraska",      "32000": "Nevada",         "33000": "New Hampshire",
  "34000": "New Jersey",    "35000": "New Mexico",     "36000": "New York",
  "37000": "North Carolina","38000": "North Dakota",   "39000": "Ohio",
  "40000": "Oklahoma",      "41000": "Oregon",         "42000": "Pennsylvania",
  "44000": "Rhode Island",  "45000": "South Carolina", "46000": "South Dakota",
  "47000": "Tennessee",     "48000": "Texas",          "49000": "Utah",
  "50000": "Vermont",       "51000": "Virginia",       "53000": "Washington",
  "54000": "West Virginia", "55000": "Wisconsin",      "56000": "Wyoming",
};

async function fetchIMF() {
  const codes = Object.keys(EU_COUNTRY_META).join("/");
  const url = `https://www.imf.org/external/datamapper/api/v1/PPPPC/${codes}`;
  console.log("Fetching IMF data...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IMF API error: ${res.status}`);
  const json = await res.json();

  const results = [];
  let latestYear = 0;

  for (const [code, meta] of Object.entries(EU_COUNTRY_META)) {
    const values = json?.values?.PPPPC?.[code];
    if (!values) {
      console.warn(`No IMF data for ${code}`);
      continue;
    }
    // Get the most recent year with a value
    const years = Object.keys(values).map(Number).sort((a, b) => b - a);
    const year = years[0];
    const gdp = Math.round(values[year]);
    if (year > latestYear) latestYear = year;
    results.push({ ...meta, gdp });
  }

  // Sort descending by gdp
  results.sort((a, b) => b.gdp - a.gdp);
  console.log(`IMF data fetched. Latest year: ${latestYear}. ${results.length} countries.`);
  return { data: results, year: latestYear };
}

async function fetchBEA() {
  // SAGDP1 line 1 = GDP in millions, line 2 = population, line 10 = per capita GDP
  // We use SAGDP10N for per capita real GDP — but for nominal per capita we compute it:
  // total GDP (SAGDP1, line 1) / population (SAINC1, line 2)
  // Simpler: use SAINC1 which has per capita personal income — but that's income not GDP.
  // Best approach: SAGDP1N (nominal GDP $millions) + ASPOP (population) to compute per capita.
  // Or use the pre-computed per capita: TableName=SAGDP1, LineCode=10 gives real per capita.
  // For nominal per capita, we fetch total nominal GDP and divide by population.

  const baseUrl = "https://apps.bea.gov/api/data";

  // Fetch nominal GDP by state (millions of dollars)
  const gdpUrl = `${baseUrl}?UserID=${BEA_API_KEY}&method=GetData&datasetname=Regional&TableName=SAGDP1N&LineCode=1&GeoFIPS=STATE&Year=LAST&ResultFormat=JSON`;
  console.log("Fetching BEA GDP data...");
  const gdpRes = await fetch(gdpUrl);
  if (!gdpRes.ok) throw new Error(`BEA GDP API error: ${gdpRes.status}`);
  const gdpJson = await gdpRes.json();

  // Fetch population by state
  const popUrl = `${baseUrl}?UserID=${BEA_API_KEY}&method=GetData&datasetname=Regional&TableName=SAINC1&LineCode=2&GeoFIPS=STATE&Year=LAST&ResultFormat=JSON`;
  console.log("Fetching BEA population data...");
  const popRes = await fetch(popUrl);
  if (!popRes.ok) throw new Error(`BEA population API error: ${popRes.status}`);
  const popJson = await popRes.json();

  const gdpData = gdpJson.BEAAPI.Results.Data;
  const popData = popJson.BEAAPI.Results.Data;

  // Build lookup maps
  const gdpByFips = {};
  let gdpYear = 0;
  for (const row of gdpData) {
    if (row.GeoFips === "00000") continue; // skip US total
    gdpByFips[row.GeoFips] = parseFloat(row.DataValue.replace(/,/g, "")) * 1e6; // convert millions -> dollars
    gdpYear = parseInt(row.TimePeriod);
  }

  const popByFips = {};
  for (const row of popData) {
    if (row.GeoFips === "00000") continue;
    popByFips[row.GeoFips] = parseFloat(row.DataValue.replace(/,/g, "")) * 1000; // thousands -> persons
  }

  const results = [];
  for (const [fips, name] of Object.entries(BEA_STATE_NAMES)) {
    const gdp = gdpByFips[fips];
    const pop = popByFips[fips];
    if (!gdp || !pop) {
      console.warn(`Missing BEA data for ${name} (${fips})`);
      continue;
    }
    const perCapita = Math.round(gdp / pop);
    const entry = { name, gdp: perCapita };
    if (fips === "11000") entry.note = "Federal district";
    results.push(entry);
  }

  results.sort((a, b) => b.gdp - a.gdp);
  console.log(`BEA data fetched. Year: ${gdpYear}. ${results.length} states.`);
  return { data: results, year: gdpYear };
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
  const [imf, bea] = await Promise.all([fetchIMF(), fetchBEA()]);

  const appPath = path.join(__dirname, "../src/App.jsx");
  let src = fs.readFileSync(appPath, "utf8");

  // Replace US_STATES array contents
  src = src.replace(
    /const US_STATES = \[[\s\S]*?\];/,
    `const US_STATES = [\n${formatStateArray(bea.data)},\n];`
  );

  // Replace EU_COUNTRIES array contents
  src = src.replace(
    /const EU_COUNTRIES = \[[\s\S]*?\];/,
    `const EU_COUNTRIES = [\n${formatEUArray(imf.data)},\n];`
  );

  // Update source year labels in the header and footer
  src = src.replace(/BEA \d{4}/g, `BEA ${bea.year}`);
  src = src.replace(/IMF WEO April \d{4}/g, `IMF WEO April ${imf.year}`);
  src = src.replace(/IMF \d{4} estimate/g, `IMF ${imf.year} estimate`);
  src = src.replace(/nominal GDP per capita, \d{4}/g, `nominal GDP per capita, ${bea.year}`);

  fs.writeFileSync(appPath, src, "utf8");
  console.log(`App.jsx updated with BEA ${bea.year} and IMF ${imf.year} data.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
