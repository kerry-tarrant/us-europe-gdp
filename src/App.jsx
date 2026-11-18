import { useState, useMemo, useEffect } from "react";
import data from "./data.json";

const METRIC_CONFIG = {
  gdp: {
    label: "GDP / capita",
    fullLabel: "GDP (PPP) per capita",
    subtitle: () => `BEA ${data.gdp.usYear} · IMF WEO ${data.gdp.euYear}`,
    desc: "Each state matched to the EU member state with the nearest GDP (PPP) per capita. Both sides in PPP-adjusted international dollars — US from BEA; EU from IMF WEO.",
    format: v => `$${v.toLocaleString()}`,
    euFormat: v => `$${v.toLocaleString()}`,
    tiers: [
      { min: 100000, color: "#f59e0b", label: ">$100k" },
      { min: 80000,  color: "#10b981", label: "$80–100k" },
      { min: 60000,  color: "#3b82f6", label: "$60–80k" },
      { min: 40000,  color: "#f97316", label: "$40–60k" },
      { min: 0,      color: "#ef4444", label: "<$40k" },
    ],
  },
  electricity: {
    label: "Electricity",
    fullLabel: "Total electricity",
    subtitle: () => `EIA SEDS · Eurostat${data.electricity.year ? ` ${data.electricity.year}` : ""}`,
    desc: "Total annual electricity consumption in GWh. US: EIA State Energy Data System. EU: Eurostat nrg_cb_e total final consumption.",
    format: v => `${v.toLocaleString()} GWh`,
    euFormat: v => `${v.toLocaleString()} GWh`,
    tiers: [
      { min: 200000, color: "#f59e0b", label: ">200k GWh" },
      { min: 100000, color: "#10b981", label: "100–200k" },
      { min: 50000,  color: "#3b82f6", label: "50–100k" },
      { min: 10000,  color: "#f97316", label: "10–50k" },
      { min: 0,      color: "#ef4444", label: "<10k" },
    ],
  },
  education: {
    label: "Education",
    fullLabel: "Educational attainment",
    subtitle: () => `ACS${data.education?.usYear ? ` ${data.education.usYear}` : ""} · Eurostat${data.education?.euYear ? ` ${data.education.euYear}` : ""}`,
    desc: "Share of adults aged 25–64 with a bachelor's degree or higher. US: Census Bureau American Community Survey. EU: Eurostat edat_lfse_03 (ISCED 5–8 tertiary attainment).",
    format: v => `${v}%`,
    euFormat: v => `${v}%`,
    tiers: [
      { min: 50, color: "#f59e0b", label: ">50%" },
      { min: 40, color: "#10b981", label: "40–50%" },
      { min: 30, color: "#3b82f6", label: "30–40%" },
      { min: 20, color: "#f97316", label: "20–30%" },
      { min: 0,  color: "#ef4444", label: "<20%" },
    ],
  },
  hightech: {
    label: "High-tech",
    fullLabel: "High-tech employment",
    subtitle: () => `BLS OES · Eurostat${data.hightech?.year ? ` ${data.hightech.year}` : ""}`,
    desc: "Share of workforce in computer, mathematical, and high-tech knowledge sectors. US: BLS OES computer & mathematical occupations (SOC 15-0000) per 1,000 jobs ÷ 10. EU: Eurostat htec_emp_nat2 (high-tech manufacturing and knowledge-intensive services).",
    format: v => `${v}%`,
    euFormat: v => `${v}%`,
    tiers: [
      { min: 8, color: "#f59e0b", label: ">8%" },
      { min: 5, color: "#10b981", label: "5–8%" },
      { min: 3, color: "#3b82f6", label: "3–5%" },
      { min: 1, color: "#f97316", label: "1–3%" },
      { min: 0, color: "#ef4444", label: "<1%" },
    ],
  },
  patents: {
    label: "Patents",
    fullLabel: "Patent applications",
    subtitle: () => `USPTO · EPO${data.patents?.year ? ` ${data.patents.year}` : ""}`,
    desc: "Patent applications per million residents. US: USPTO utility patent applications by state of inventor. EU: Eurostat pat_ep_rtot (EPO patent applications per million inhabitants).",
    format: v => `${v.toLocaleString()}/M`,
    euFormat: v => `${v.toLocaleString()}/M`,
    tiers: [
      { min: 1000, color: "#f59e0b", label: ">1,000/M" },
      { min: 400,  color: "#10b981", label: "400–1,000" },
      { min: 100,  color: "#3b82f6", label: "100–400" },
      { min: 20,   color: "#f97316", label: "20–100" },
      { min: 0,    color: "#ef4444", label: "<20" },
    ],
  },
};

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

export default function App() {
  const [metric, setMetric] = useState("gdp");
  const [sortBy, setSortBy] = useState("val_desc");
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch {}
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  const config = METRIC_CONFIG[metric];
  const metricData = data[metric];
  const hasData = metricData?.us?.length > 0 && metricData?.eu?.length > 0;

  const maxVal = useMemo(() => {
    if (!hasData) return 1;
    return Math.max(...metricData.us.map(d => d.value), ...metricData.eu.map(d => d.value)) * 1.05;
  }, [metric, hasData]);

  const filtered = useMemo(() => {
    if (!hasData) return [];
    let list = metricData.us.map(state => ({
      ...state,
      closest: findClosestCountry(state.value, metricData.eu),
      tierColor: getTierColor(state.value, config.tiers),
    }));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.closest.name.toLowerCase().includes(q)
      );
    }
    if (sortBy === "val_desc") list.sort((a, b) => b.value - a.value);
    if (sortBy === "val_asc")  list.sort((a, b) => a.value - b.value);
    if (sortBy === "alpha_az") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "alpha_za") list.sort((a, b) => b.name.localeCompare(a.name));
    return list;
  }, [metric, sortBy, search, hasData]);

  const isDark = theme === "dark";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>

      {/* Sticky header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "var(--shadow)",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px" }}>

          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 10px" }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: "clamp(15px, 3vw, 21px)", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                US States vs. EU Member States
              </h1>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                {config.fullLabel} · {config.subtitle()}
              </div>
            </div>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 8, width: 36, height: 36,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "var(--text2)", fontSize: 15,
                flexShrink: 0, marginLeft: 12, transition: "background 0.15s",
                fontFamily: "inherit",
              }}
            >
              <i className={isDark ? "fas fa-sun" : "fas fa-moon"} />
            </button>
          </div>

          {/* Metric tab pills */}
          <div style={{ display: "flex", gap: 4, paddingBottom: 12, overflowX: "auto", scrollbarWidth: "none" }}>
            {Object.entries(METRIC_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => { setMetric(key); setSortBy("val_desc"); setSearch(""); }}
                style={{
                  padding: "5px 12px", borderRadius: 6,
                  border: "1px solid",
                  borderColor: metric === key ? "var(--accent)" : "var(--border)",
                  background: metric === key ? "var(--accent-muted)" : "transparent",
                  color: metric === key ? "var(--accent)" : "var(--text2)",
                  fontSize: 12, fontWeight: metric === key ? 600 : 400,
                  cursor: "pointer", whiteSpace: "nowrap",
                  transition: "all 0.15s", fontFamily: "inherit",
                }}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Controls */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 20px", display: "flex", gap: 8 }}>
        <input
          placeholder="Search state or country…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: "1 1 180px",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "7px 12px",
            color: "var(--text)", fontFamily: "inherit", fontSize: 13, outline: "none",
          }}
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "7px 10px",
            color: "var(--text2)", fontFamily: "inherit", fontSize: 13,
            cursor: "pointer", outline: "none",
          }}
        >
          <option value="val_desc">↓ Highest</option>
          <option value="val_asc">↑ Lowest</option>
          <option value="alpha_az">A → Z</option>
          <option value="alpha_za">Z → A</option>
        </select>
      </div>

      {/* Legend */}
      {hasData && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 10px", display: "flex", gap: 12, flexWrap: "wrap" }}>
          {config.tiers.map(tier => (
            <div key={tier.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text2)" }}>
              <div style={{ width: 8, height: 8, background: tier.color, borderRadius: 2, flexShrink: 0 }} />
              {tier.label}
            </div>
          ))}
        </div>
      )}

      {/* No-data state */}
      {!hasData && (
        <div style={{ maxWidth: 900, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <p style={{ fontSize: 14, color: "var(--text3)", margin: 0 }}>
            Data for this metric will populate on the next scheduled update.
          </p>
        </div>
      )}

      {/* Rows */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 40px", display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.map((state, i) => {
          const barPct   = (state.value / maxVal) * 100;
          const euBarPct = (state.closest.value / maxVal) * 100;
          const diff     = state.value - state.closest.value;
          const diffPct  = state.closest.value !== 0
            ? Math.round((diff / state.closest.value) * 100)
            : null;
          const isPos = diff > 0;

          return (
            <div
              key={state.name}
              onMouseEnter={() => setHighlight(state.name)}
              onMouseLeave={() => setHighlight(null)}
              style={{
                display: "flex", gap: 12,
                padding: "12px 14px 10px",
                borderRadius: 8,
                background: highlight === state.name ? "var(--surface)" : "transparent",
                borderLeft: `3px solid ${highlight === state.name ? state.tierColor : "transparent"}`,
                transition: "all 0.1s",
                cursor: "default",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--text3)", width: 22, textAlign: "right", paddingTop: 3, flexShrink: 0 }}>
                {i + 1}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Name */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{state.name}</span>
                  {state.note && <span style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>{state.note}</span>}
                </div>

                {/* US value */}
                <div style={{ fontSize: 19, fontWeight: 700, color: state.tierColor, marginBottom: 4, lineHeight: 1.2 }}>
                  {config.format(state.value)}
                </div>

                {/* EU match */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text2)" }}>
                    ≈ {state.closest.flag} {state.closest.name}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>
                    {config.euFormat(state.closest.value)}
                  </span>
                  {state.closest.note && (
                    <span style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>({state.closest.note})</span>
                  )}
                  {diffPct !== null && (
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: isPos ? "#10b981" : "#ef4444",
                      background: isPos ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                      padding: "1px 7px", borderRadius: 999,
                    }}>
                      {isPos ? "+" : ""}{diffPct}%
                    </span>
                  )}
                </div>

                {/* Bars */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: "var(--text3)", width: 18, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>US</span>
                    <div style={{ flex: 1, height: 5, background: "var(--surface3)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${barPct}%`, background: state.tierColor, borderRadius: 3, transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: "var(--text3)", width: 18, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>EU</span>
                    <div style={{ flex: 1, height: 4, background: "var(--surface3)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${euBarPct}%`, background: "var(--accent)", borderRadius: 3, opacity: 0.6, transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <footer style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 48px", borderTop: "1px solid var(--border2)" }}>
        <p style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.9, margin: "0 0 20px" }}>
          <strong style={{ color: "var(--text2)" }}>Methodology</strong><br />
          Each US state is matched to the EU member state whose value is closest (nearest neighbor). The match is recalculated independently per metric.<br /><br />

          <strong style={{ color: "var(--text2)" }}>GDP (PPP) per capita</strong><br />
          PPP-adjusted international dollars. US: BEA nominal GDP per capita ({data.gdp.usYear}); EU: IMF WEO PPP GDP per capita ({data.gdp.euYear} estimate). Ireland and Luxembourg inflated by multinationals booking profits there.<br /><br />

          <strong style={{ color: "var(--text2)" }}>Total electricity</strong><br />
          US: EIA State Energy Data System ({data.electricity.year}). EU: Eurostat nrg_cb_e total final electricity consumption ({data.electricity.year}). Both in GWh, all end-use sectors.<br /><br />

          <strong style={{ color: "var(--text2)" }}>Educational attainment</strong><br />
          % of adults 25–64 with bachelor's degree or higher. US: Census Bureau ACS. EU: Eurostat edat_lfse_03 (ISCED 5–8 tertiary attainment).<br /><br />

          <strong style={{ color: "var(--text2)" }}>High-tech employment</strong><br />
          US: BLS OES SOC 15-0000 (computer & mathematical occupations) per 1,000 jobs ÷ 10 = % of total employment. EU: Eurostat htec_emp_nat2 (% employed in high-tech manufacturing and knowledge-intensive services). Note: US measures a narrower occupation set than the broader EU sector classification.<br /><br />

          <strong style={{ color: "var(--text2)" }}>Patent applications</strong><br />
          Per million residents. US: USPTO utility patent applications by state of inventor residence. EU: Eurostat pat_ep_rtot (EPO applications per million inhabitants). Both lag 1–2 years.<br /><br />

          <strong style={{ color: "var(--text2)" }}>% difference</strong><br />
          (US value − EU value) / EU value. Positive = US state exceeds matched EU country.
        </p>

        <p style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.9, margin: "0 0 24px" }}>
          <strong style={{ color: "var(--text2)" }}>Sources</strong><br />
          GDP US: <a href="https://www.bea.gov/data/gdp/gdp-state" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Bureau of Economic Analysis</a> · <a href="https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_GDP" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Wikipedia</a><br />
          GDP EU: <a href="https://data.imf.org/en/datasets/IMF.RES:WEO" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>IMF World Economic Outlook</a><br />
          Electricity US: <a href="https://www.eia.gov/state/seds/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>EIA State Energy Data System</a><br />
          Electricity EU: <a href="https://ec.europa.eu/eurostat/databrowser/view/nrg_cb_e" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Eurostat nrg_cb_e</a><br />
          Education US: <a href="https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_educational_attainment" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Wikipedia · Census ACS</a><br />
          Education EU: <a href="https://ec.europa.eu/eurostat/databrowser/view/edat_lfse_03" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Eurostat edat_lfse_03</a><br />
          High-tech US: <a href="https://www.bls.gov/oes/current/oes150000.htm" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>BLS Occupational Employment Statistics</a><br />
          High-tech EU: <a href="https://ec.europa.eu/eurostat/databrowser/view/htec_emp_nat2" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Eurostat htec_emp_nat2</a><br />
          Patents US: <a href="https://en.wikipedia.org/wiki/List_of_U.S._states_by_patent_activity" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Wikipedia · USPTO</a><br />
          Patents EU: <a href="https://ec.europa.eu/eurostat/databrowser/view/pat_ep_rtot" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Eurostat pat_ep_rtot</a>
        </p>

        <div style={{ display: "flex", gap: 12 }}>
          {[
            { href: "https://github.com/kerry-tarrant", icon: "fab fa-github", label: "GitHub" },
            { href: "https://kerry-tarrant.github.io/", icon: "fas fa-globe", label: "Website" },
          ].map(({ href, icon, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px",
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 8, color: "var(--text2)", fontSize: 13,
                textDecoration: "none", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text2)"; }}
            >
              <i className={icon} style={{ fontSize: 14 }} />
              {label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
