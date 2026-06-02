import { useState, useMemo } from "react";

// US States - Nominal GDP per capita 2024 (BEA, via Wikipedia/BEA)
const US_STATES = [
  { name: "District of Columbia", gdp: 263220, note: "Federal district" },
  { name: "New York", gdp: 117332 },
  { name: "Massachusetts", gdp: 110561 },
  { name: "Washington", gdp: 108468 },
  { name: "California", gdp: 104916 },
  { name: "Connecticut", gdp: 100235 },
  { name: "North Dakota", gdp: 95982 },
  { name: "Alaska", gdp: 95147 },
  { name: "Nebraska", gdp: 93145 },
  { name: "Colorado", gdp: 93026 },
  { name: "Delaware", gdp: 98055 },
  { name: "Illinois", gdp: 90449 },
  { name: "New Jersey", gdp: 90272 },
  { name: "Wyoming", gdp: 90335 },
  { name: "Maryland", gdp: 87021 },
  { name: "Texas", gdp: 86987 },
  { name: "Virginia", gdp: 86747 },
  { name: "Minnesota", gdp: 86371 },
  { name: "New Hampshire", gdp: 85518 },
  { name: "Utah", gdp: 86506 },
  { name: "South Dakota", gdp: 80685 },
  { name: "Nevada", gdp: 80880 },
  { name: "Hawaii", gdp: 80325 },
  { name: "Iowa", gdp: 79631 },
  { name: "Kansas", gdp: 79513 },
  { name: "Pennsylvania", gdp: 78544 },
  { name: "Georgia", gdp: 78754 },
  { name: "Ohio", gdp: 78120 },
  { name: "Oregon", gdp: 77916 },
  { name: "Indiana", gdp: 76004 },
  { name: "North Carolina", gdp: 75876 },
  { name: "Tennessee", gdp: 75748 },
  { name: "Wisconsin", gdp: 75605 },
  { name: "Rhode Island", gdp: 74594 },
  { name: "Florida", gdp: 73784 },
  { name: "Arizona", gdp: 73203 },
  { name: "Missouri", gdp: 72108 },
  { name: "Michigan", gdp: 71083 },
  { name: "Louisiana", gdp: 71642 },
  { name: "Maine", gdp: 69803 },
  { name: "Vermont", gdp: 70131 },
  { name: "New Mexico", gdp: 66229 },
  { name: "Montana", gdp: 66379 },
  { name: "Kentucky", gdp: 64110 },
  { name: "Oklahoma", gdp: 64719 },
  { name: "Idaho", gdp: 63991 },
  { name: "South Carolina", gdp: 63711 },
  { name: "Alabama", gdp: 61846 },
  { name: "West Virginia", gdp: 60783 },
  { name: "Arkansas", gdp: 60276 },
  { name: "Mississippi", gdp: 53061 },
];

// European countries - GDP per capita PPP 2026 estimate (IMF WEO April 2026, via Wikipedia)
const EU_COUNTRIES = [
  { name: "Ireland", gdp: 159129, flag: "🇮🇪", note: "Inflated by multinationals" },
  { name: "Luxembourg", gdp: 156719, flag: "🇱🇺" },
  { name: "Norway", gdp: 115548, flag: "🇳🇴" },
  { name: "Switzerland", gdp: 105680, flag: "🇨🇭" },
  { name: "Denmark", gdp: 89667, flag: "🇩🇰" },
  { name: "Netherlands", gdp: 87773, flag: "🇳🇱" },
  { name: "San Marino", gdp: 87141, flag: "🇸🇲" },
  { name: "Iceland", gdp: 82730, flag: "🇮🇸" },
  { name: "Malta", gdp: 82421, flag: "🇲🇹" },
  { name: "Belgium", gdp: 78334, flag: "🇧🇪" },
  { name: "Austria", gdp: 78334, flag: "🇦🇹" },
  { name: "Sweden", gdp: 77094, flag: "🇸🇪" },
  { name: "Germany", gdp: 76747, flag: "🇩🇪" },
  { name: "Andorra", gdp: 75988, flag: "🇦🇩" },
  { name: "Finland", gdp: 68861, flag: "🇫🇮" },
  { name: "France", gdp: 68567, flag: "🇫🇷" },
  { name: "Cyprus", gdp: 67796, flag: "🇨🇾" },
  { name: "United Kingdom", gdp: 67585, flag: "🇬🇧" },
  { name: "Italy", gdp: 65761, flag: "🇮🇹" },
  { name: "Czechia", gdp: 63550, flag: "🇨🇿" },
  { name: "Lithuania", gdp: 61052, flag: "🇱🇹" },
  { name: "Slovenia", gdp: 60664, flag: "🇸🇮" },
  { name: "Spain", gdp: 59187, flag: "🇪🇸" },
  { name: "Poland", gdp: 59792, flag: "🇵🇱" },
  { name: "Croatia", gdp: 54359, flag: "🇭🇷" },
  { name: "Portugal", gdp: 52841, flag: "🇵🇹" },
  { name: "Estonia", gdp: 51653, flag: "🇪🇪" },
  { name: "Romania", gdp: 50783, flag: "🇷🇴" },
  { name: "Hungary", gdp: 50570, flag: "🇭🇺" },
  { name: "Slovakia", gdp: 49466, flag: "🇸🇰" },
  { name: "Greece", gdp: 47175, flag: "🇬🇷" },
  { name: "Latvia", gdp: 45840, flag: "🇱🇻" },
  { name: "Bulgaria", gdp: 45642, flag: "🇧🇬" },
  { name: "Montenegro", gdp: 36333, flag: "🇲🇪" },
  { name: "Serbia", gdp: 34863, flag: "🇷🇸" },
  { name: "North Macedonia", gdp: 31746, flag: "🇲🇰" },
  { name: "Bosnia & Herz.", gdp: 24123, flag: "🇧🇦" },
  { name: "Albania", gdp: 25247, flag: "🇦🇱" },
  { name: "Kosovo", gdp: 21799, flag: "🇽🇰" },
  { name: "Moldova", gdp: 21170, flag: "🇲🇩" },
  { name: "Ukraine", gdp: 22443, flag: "🇺🇦" },
];

function findClosestEuCountry(stateGdp) {
  return EU_COUNTRIES.reduce((closest, country) => {
    return Math.abs(country.gdp - stateGdp) < Math.abs(closest.gdp - stateGdp)
      ? country
      : closest;
  });
}

const TIER_COLORS = {
  ">100k":   { bar: "#f0c040", text: "#f0c040" },
  "80-100k": { bar: "#4ade80", text: "#4ade80" },
  "60-80k":  { bar: "#38bdf8", text: "#38bdf8" },
  "40-60k":  { bar: "#f97316", text: "#f97316" },
  "<40k":    { bar: "#f87171", text: "#f87171" },
};

function getTier(gdp) {
  if (gdp > 100000) return ">100k";
  if (gdp > 80000) return "80-100k";
  if (gdp > 60000) return "60-80k";
  if (gdp > 40000) return "40-60k";
  return "<40k";
}

export default function App() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("gdp_desc");
  const [highlight, setHighlight] = useState(null);

  const maxGdp = 270000;

  const filtered = useMemo(() => {
    let list = US_STATES.map((s) => ({
      ...s,
      closest: findClosestEuCountry(s.gdp),
      tier: getTier(s.gdp),
    }));

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.closest.name.toLowerCase().includes(q)
      );
    }

    if (sortBy === "gdp_desc") list.sort((a, b) => b.gdp - a.gdp);
    if (sortBy === "gdp_asc") list.sort((a, b) => a.gdp - b.gdp);
    if (sortBy === "alpha") list.sort((a, b) => a.name.localeCompare(b.name));

    return list;
  }, [search, sortBy]);

  return (
    <div style={{
      fontFamily: "'Courier New', monospace",
      background: "#080d12",
      minHeight: "100vh",
      color: "#c8d8e8",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #0a1929 0%, #080d12 100%)",
        borderBottom: "1px solid #1a3a5c",
        padding: "32px 24px 24px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            color: "#4a7fa8",
            marginBottom: 8,
            textTransform: "uppercase",
          }}>
            Economic Comparison · BEA 2024 · IMF WEO April 2026
          </div>
          <h1 style={{
            fontSize: "clamp(22px, 4vw, 36px)",
            fontWeight: 700,
            color: "#e8f4ff",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}>
            US States vs. European Nations
          </h1>
          <p style={{
            fontSize: 13,
            color: "#5a8ab0",
            margin: 0,
            lineHeight: 1.6,
            maxWidth: 600,
          }}>
            Each state matched to the European country with the nearest GDP per capita.
            US figures are nominal (BEA 2024); European figures are PPP-adjusted (IMF 2026 estimate).
            Outliers aside, the bulk of US states and Western European countries cluster in the same $60-90k range. The differences within each group are often larger than the differences between them.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "16px 24px",
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        <input
          placeholder="Search state or country…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "#0d1f31",
            border: "1px solid #1a3a5c",
            borderRadius: 4,
            padding: "8px 12px",
            color: "#c8d8e8",
            fontFamily: "inherit",
            fontSize: 13,
            flex: "1 1 200px",
            outline: "none",
          }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            background: "#0d1f31",
            border: "1px solid #1a3a5c",
            borderRadius: 4,
            padding: "8px 12px",
            color: "#c8d8e8",
            fontFamily: "inherit",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <option value="gdp_desc">↓ Richest first</option>
          <option value="gdp_asc">↑ Poorest first</option>
          <option value="alpha">A-Z</option>
        </select>

      </div>

      {/* Legend */}
      <div style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "0 24px 16px",
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
      }}>
        {Object.entries(TIER_COLORS).map(([label, colors]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#a0b8cc" }}>
            <div style={{ width: 10, height: 10, background: colors.bar, borderRadius: 2 }} />
            {label}
          </div>
        ))}
      </div>

      {/* List */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>
        {filtered.map((state, i) => {
          const tierColor = TIER_COLORS[state.tier];
          const barPct = (state.gdp / maxGdp) * 100;
          const euBarPct = (state.closest.gdp / maxGdp) * 100;
          const diff = state.gdp - state.closest.gdp;
          const diffPct = ((diff / state.closest.gdp) * 100).toFixed(0);

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
                <span style={{
                  fontSize: 11,
                  color: "#4a6a8a",
                  width: 24,
                  textAlign: "right",
                  flexShrink: 0,
                  paddingTop: 2,
                }}>
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

              {/* Line 2: US GDP standalone */}
              <div style={{ paddingLeft: 34, marginBottom: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: tierColor.text }}>
                  ${state.gdp.toLocaleString()}
                </span>
              </div>

              {/* Line 3: EU match + diff% — wraps gracefully on narrow screens */}
              <div style={{ paddingLeft: 34, marginBottom: 8, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px" }}>
                <span style={{ fontSize: 13, color: "#8ab0d0" }}>
                  ≈ {state.closest.flag} {state.closest.name}
                </span>
                <span style={{ fontSize: 12, color: "#6a8aaa" }}>
                  ${state.closest.gdp.toLocaleString()}
                </span>
                {state.closest.note && (
                  <span style={{ fontSize: 11, color: "#5a7a9a", fontStyle: "italic" }}>
                    ({state.closest.note})
                  </span>
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: diff > 0 ? "#2ecc71" : "#e74c3c" }}>
                  {diff > 0 ? "+" : ""}{diffPct}%
                </span>
              </div>

              {/* Bar tracks */}
              <div style={{ paddingLeft: 34 }}>
                <div style={{ position: "relative", height: 6, background: "#0a1825", borderRadius: 3, marginBottom: 3 }}>
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${barPct}%`,
                    background: tierColor.bar,
                    borderRadius: 3,
                    transition: "width 0.3s ease",
                  }} />
                </div>
                <div style={{ position: "relative", height: 4, background: "#0a1825", borderRadius: 3 }}>
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${euBarPct}%`,
                    background: "#2a4a6a",
                    borderRadius: 3,
                    transition: "width 0.3s ease",
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "20px 24px 32px",
        borderTop: "1px solid #0d1f31",
      }}>
        <p style={{ fontSize: 12, color: "#5a8ab0", lineHeight: 1.9, margin: 0 }}>
          <strong style={{ color: "#7ab0d0" }}>Methodology</strong><br />
          This chart matches each US state to the European country whose GDP per capita is closest in dollar value. The match is purely by nearest neighbor. It does not account for population size, industry mix, or cost of living within states.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>Why the numbers aren't perfectly comparable</strong><br />
          US state figures are <em>nominal</em> GDP per capita in US dollars (BEA, 2024). European figures are <em>PPP-adjusted</em> GDP per capita in international dollars (IMF, 2026 estimates). PPP adjustment removes the effect of price level differences between countries. It effectively makes European incomes look somewhat higher than nominal exchange rates would suggest. As a result, this comparison modestly favors Europe: on a strict nominal basis, US states would pull even further ahead. Despite this caveat, the comparison is widely used and directionally meaningful.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>Outliers to note</strong><br />
          Ireland and Luxembourg report unusually high GDP per capita because large multinational corporations book profits there for tax purposes. This inflates their GDP figures well beyond what residents actually earn. Norway's high figure reflects oil wealth. DC's figure ($263k) reflects output concentrated among a large federal workforce relative to a small residential population. It is not comparable to a state.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>% difference</strong><br />
          The percentage shown is calculated as (US state GDP - EU country GDP) / EU country GDP. A positive value means the state's nominal GDP per capita exceeds the matched European country's PPP-adjusted figure.<br /><br />

          <strong style={{ color: "#7ab0d0" }}>Sources</strong><br />
          US:{" "}
          <a href="https://www.bea.gov/data/gdp/gdp-state" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Bureau of Economic Analysis</a>{" "}
          (nominal GDP per capita, 2024) ·{" "}
          <a href="https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_GDP" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Wikipedia summary</a><br />
          Europe:{" "}
          <a href="https://data.imf.org/en/datasets/IMF.RES:WEO" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>IMF World Economic Outlook, April 2026</a>{" "}
          (GDP per capita PPP, international dollars) ·{" "}
          <a href="https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(PPP)_per_capita" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8ab0" }}>Wikipedia summary</a>
        </p>
      </div>

      {/* Author links */}
      <div style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "16px 24px 40px",
        display: "flex",
        gap: 16,
      }}>
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
