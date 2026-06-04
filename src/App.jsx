import { useState, useMemo } from "react";
import data from "./data.json";

// ─── Per-metric configuration ─────────────────────────────────────────────────

const METRIC_CONFIG = {
  gdp: {
    label:      "GDP (PPP) per capita",
    subtitle:   () => `Economic Comparison · BEA ${data.gdp.usYear} · IMF WEO April ${data.gdp.euYear}`,
    desc:       "Each state matched to the European country with the nearest GDP (PPP) per capita. Both sides in PPP-adjusted international dollars — US values from BEA (USD ≈ international dollar); European values from IMF WEO.",
    format:     v => `$${v.toLocaleString()}`,
    euFormat:   v => `$${v.toLocaleString()}`,
    tiers: [
      { min: 100000, color: "#f0c040", label: ">$100k" },
      { min: 80000,  color: "#4ade80", label: "$80-100k" },
      { min: 60000,  color: "#38bdf8", label: "$60-80k" },
      { min: 40000,  color: "#f97316", label: "$40-60k" },
      { min: 0,      color: "#f87171", label: "<$40k" },
    ],
  },
  electricity: {
    label:    "Total electricity",
    subtitle: () => `Electricity · EIA SEDS · Eurostat${data.electricity.year ? ` ${data.electricity.year}` : ""}`,
    desc:     "Each state matched to the European country with the nearest total electricity consumption (GWh, 2024 annual). US: EIA State Energy Data System. Europe: Eurostat nrg_cb_e total final consumption.",
    format:   v => `${v.toLocaleString()} GWh`,
    euFormat: v => `${v.toLocaleString()} GWh`,
    tiers: [
      { min: 200000, color: "#f0c040", label: ">200k GWh" },
      { min: 100000, color: "#4ade80", label: "100-200k" },
      { min: 50000,  color: "#38bdf8", label: "50-100k" },
      { min: 10000,  color: "#f97316", label: "10-50k" },
      { min: 0,      color: "#f87171", label: "<10k" },
    ],
  },
  income: {
    label:      "Per capita net income",
    subtitle:   () => `Income · BEA ${data.income.usYear ?? "2023"} · Eurostat ILC-DI03 ${data.income.euYear ?? ""}`,
    desc:       "Each state matched to the European country with the nearest per capita net income. US: BEA per capita personal income minus estimated 22% combined taxes. Europe: Eurostat mean equivalised net disposable income in PPS, converted to USD at ~1 PPS = $1.07.",
    format:     v => `$${v.toLocaleString()}`,
    euFormat:   v => `$${v.toLocaleString()}`,
    tiers: [
      { min: 55000, color: "#f0c040", label: ">$55k" },
      { min: 40000, color: "#4ade80", label: "$40-55k" },
      { min: 25000, color: "#38bdf8", label: "$25-40k" },
      { min: 14000, color: "#f97316", label: "$14-25k" },
      { min: 0,     color: "#f87171", label: "<$14k" },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTierColor(value, tiers) {
  for (const tier of tiers) {
    if (value >= tier.min) return tier.color;
  }
  return tiers[tiers.length - 1].color;
}

function findClosestCountry(stateValue, euData) {
  return euData.reduce((closest, country) =>
    Math.abs(country.value - stateValue) < Math.abs(closest.value - stateValue)
      ? country : closest
  );
}

// ─── Shared input / select styles ────────────────────────────────────────────

const controlBase = {
  background:  "#0d1f31",
  border:      "1px solid #1a3a5c",
  borderRadius: 4,
  padding:     "8px 12px",
  color:       "#c8d8e8",
  fontFamily:  "inherit",
  fontSize:    13,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [metric,    setMetric]    = useState("gdp");
  const [sortBy,    setSortBy]    = useState("val_desc");
  const [search,    setSearch]    = useState("");
  const [highlight, setHighlight] = useState(null);

  const config     = METRIC_CONFIG[metric];
  const metricData = data[metric];
  const hasData    = metricData?.us?.length > 0 && metricData?.eu?.length > 0;

  const maxVal = useMemo(() => {
    if (!hasData) return 1;
    const all = [...metricData.us, ...metricData.eu].map(d => d.value);
    return Math.max(...all) * 1.05;
  }, [metric, hasData]);

  const filtered = useMemo(() => {
    if (!hasData) return [];

    let list = metricData.us.map(state => ({
      ...state,
      closest:    findClosestCountry(state.value, metricData.eu),
      tierColor:  getTierColor(state.value, config.tiers),
    }));

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.closest.name.toLowerCase().includes(q)
      );
    }

    if (sortBy === "val_desc")  list.sort((a, b) => b.value - a.value);
    if (sortBy === "val_asc")   list.sort((a, b) => a.value - b.value);
    if (sortBy === "alpha_az")  list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "alpha_za")  list.sort((a, b) => b.name.localeCompare(a.name));

    return list;
  }, [metric, sortBy, search, hasData]);

  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#080d12", minHeight: "100vh", color: "#c8d8e8", padding: 0 }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(180deg, #0a1929 0%, #080d12 100%)", borderBottom: "1px solid #1a3a5c", padding: "32px 24px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#4a7fa8", marginBottom: 8, textTransform: "uppercase" }}>
            {config.subtitle()}
          </div>
          <h1 style={{ fontSize: "clamp(22px, 4vw, 36px)", fontWeight: 700, color: "#e8f4ff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            US States vs. European Nations
          </h1>
          <p style={{ fontSize: 13, color: "#5a8ab0", margin: 0, lineHeight: 1.6, maxWidth: 600 }}>
            {config.desc}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={metric}
          onChange={e => { setMetric(e.target.value); setSortBy("val_desc"); setSearch(""); }}
          style={{ ...controlBase, cursor: "pointer" }}
        >
          <option value="gdp">GDP (PPP) per capita</option>
          <option value="electricity">Total electricity</option>
          <option value="income">Per capita net income</option>
        </select>

        <input
          placeholder="Search state or country…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...controlBase, flex: "1 1 180px", outline: "none" }}
        />

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{ ...controlBase, cursor: "pointer" }}
        >
          <option value="val_desc">↓ Highest first</option>
          <option value="val_asc">↑ Lowest first</option>
          <option value="alpha_az">A → Z</option>
          <option value="alpha_za">Z → A</option>
        </select>
      </div>

      {/* No-data state */}
      {!hasData && (
        <div style={{ maxWidth: 900, margin: "48px auto", padding: "0 24px", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#3a5a7a" }}>
            Data not yet available — populates on the 1st of each month.
          </p>
        </div>
      )}

      {/* Legend */}
      {hasData && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 16px", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {config.tiers.map(tier => (
            <div key={tier.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#a0b8cc" }}>
              <div style={{ width: 10, height: 10, background: tier.color, borderRadius: 2 }} />
              {tier.label}
            </div>
          ))}
        </div>
      )}

      {/* List */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>
        {filtered.map((state, i) => {
          const barPct   = (state.value / maxVal) * 100;
          const euBarPct = (state.closest.value / maxVal) * 100;
          const diff     = state.value - state.closest.value;
          const diffPct  = state.closest.value !== 0
            ? ((diff / state.closest.value) * 100).toFixed(0)
            : null;

          return (
            <div
              key={state.name}
              onMouseEnter={() => setHighlight(state.name)}
              onMouseLeave={() => setHighlight(null)}
              style={{
                marginBottom: 3,
                padding: "12px 14px",
                borderRadius: 4,
                border: `1px solid ${highlight === state.name ? "#1a3a5c" : "transparent"}`,
                background: highlight === state.name ? "#0d1f31" : "transparent",
                transition: "all 0.15s",
                cursor: "default",
              }}
            >
              {/* Line 1: rank + state name */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: "#4a6a8a", width: 24, textAlign: "right", flexShrink: 0, paddingTop: 2 }}>
                  {i + 1}
                </span>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#d8eaff", letterSpacing: "-0.01em" }}>
                    {state.name}
                  </span>
                  {state.note && (
                    <span style={{ fontSize: 11, color: "#5a7a9a", fontStyle: "italic", marginLeft: 6 }}>
                      ({state.note})
                    </span>
                  )}
                </div>
              </div>

              {/* Line 2: US value */}
              <div style={{ paddingLeft: 34, marginBottom: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: state.tierColor }}>
                  {config.format(state.value)}
                </span>
              </div>

              {/* Line 3: EU match + diff% */}
              <div style={{ paddingLeft: 34, marginBottom: 8, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px" }}>
                <span style={{ fontSize: 13, color: "#8ab0d0" }}>
                  ≈ {state.closest.flag} {state.closest.name}
                </span>
                <span style={{ fontSize: 12, color: "#6a8aaa" }}>
                  {config.euFormat(state.closest.value)}
                </span>
                {state.closest.note && (
                  <span style={{ fontSize: 11, color: "#5a7a9a", fontStyle: "italic" }}>
                    ({state.closest.note})
                  </span>
                )}
                {diffPct !== null && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: diff > 0 ? "#2ecc71" : "#e74c3c" }}>
                    {diff > 0 ? "+" : ""}{diffPct}%
                  </span>
                )}
              </div>

              {/* Bar tracks */}
              <div style={{ paddingLeft: 34 }}>
                <div style={{ position: "relative", height: 6, background: "#0a1825", borderRadius: 3, marginBottom: 3 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barPct}%`, background: state.tierColor, borderRadius: 3, transition: "width 0.3s ease" }} />
                </div>
                <div style={{ position: "relative", height: 4, background: "#0a1825", borderRadius: 3 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${euBarPct}%`, background: "#2a4a6a", borderRadius: 3, transition: "width 0.3s ease" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px 32px", borderTop: "1px solid #0d1f31" }}>
        <p style={{ fontSize: 12, color: "#5a8ab0", lineHeight: 1.9, margin: 0 }}>
          <strong style={{ color: "#7ab0d0" }}>Methodology</strong><br />
          Each US state is matched to the European country whose value is closest (nearest neighbor). The match is recalculated independently per metric — a state may match a different country depending on which metric is selected. Multiple states can match the same European country.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>GDP (PPP) per capita</strong><br />
          Both US and European figures are in PPP-adjusted international dollars. US state figures use BEA nominal GDP per capita (BEA, {data.gdp.usYear}); because the US dollar is the reference currency for international dollar PPP calculations, US nominal ≈ PPP. European figures are IMF WEO PPP GDP per capita ({data.gdp.euYear} estimate). Ireland and Luxembourg are inflated by multinationals booking profits there; DC reflects concentrated federal output relative to a small resident population.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>Total electricity</strong><br />
          US figures are total electricity consumption in GWh (EIA State Energy Data System, {data.electricity.year}). European figures are total final electricity consumption in GWh (Eurostat <em>nrg_cb_e</em>, {data.electricity.year}). Both cover all end-use sectors. Ukraine figure is 2020 (most recent Eurostat data available); Kosovo is 2023.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>Per capita net income</strong><br />
          US figures are BEA per capita personal income (gross) with an estimated 22% combined tax deduction (federal ~9%, FICA ~8%, average state ~5%) to approximate net. European figures are Eurostat mean equivalised net disposable income in PPS from ILC-DI03, converted to USD at approximately 1 PPS = $1.07. EU values use the OECD equivalence scale (adjusts for household size), so they represent income per equivalent adult rather than strict per-capita — slightly higher than a simple per-person average would be.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>% difference</strong><br />
          Calculated as (US state value − EU country value) / EU country value. Positive means the US state's figure exceeds the matched European country's figure.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>Sources</strong><br />
          GDP US:{" "}
          <a href="https://www.bea.gov/data/gdp/gdp-state" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Bureau of Economic Analysis</a>{" "}·{" "}
          <a href="https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_GDP" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Wikipedia</a><br />
          GDP Europe:{" "}
          <a href="https://data.imf.org/en/datasets/IMF.RES:WEO" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>IMF World Economic Outlook</a>{" "}·{" "}
          <a href="https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(PPP)_per_capita" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Wikipedia</a><br />
          Electricity US:{" "}
          <a href="https://www.eia.gov/state/seds/" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>EIA State Energy Data System</a><br />
          Electricity Europe:{" "}
          <a href="https://ec.europa.eu/eurostat/databrowser/view/nrg_cb_e" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Eurostat nrg_cb_e</a><br />
          Income US:{" "}
          <a href="https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_income" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Wikipedia · BEA per capita personal income</a><br />
          Income Europe:{" "}
          <a href="https://ec.europa.eu/eurostat/databrowser/view/ilc_di03" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Eurostat ILC-DI03</a>
        </p>
      </div>

      {/* Author links */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px 40px", display: "flex", gap: 16 }}>
        {[
          { href: "https://github.com/kerry-tarrant", icon: "fab fa-github" },
          { href: "https://kerry-tarrant.github.io/", icon: "fas fa-globe" },
        ].map(({ href, icon }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "3.5rem",
              height: "3.5rem",
              backgroundColor: "#495057",
              color: "#fff",
              borderRadius: "100%",
              fontSize: "1.5rem",
              textDecoration: "none",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#bd5d38"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "#495057"}
          >
            <i className={icon} />
          </a>
        ))}
      </div>

    </div>
  );
}
