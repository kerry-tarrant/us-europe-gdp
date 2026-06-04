# US States vs. European Nations

[![Update Data & Deploy](https://github.com/kerry-tarrant/us-europe-gdp/actions/workflows/update-and-deploy.yml/badge.svg)](https://github.com/kerry-tarrant/us-europe-gdp/actions/workflows/update-and-deploy.yml)

An interactive data visualization that matches each US state to the European country with the closest value across three metrics: GDP per capita, total electricity consumption, and per capita net income.

**Live site:** https://kerry-tarrant.github.io/us-europe-gdp/

## Data Sources

**GDP (PPP) per capita**
- US states: Wikipedia (sourced from BEA) — nominal GDP per capita
- Europe: IMF World Economic Outlook — PPP-adjusted GDP per capita, international dollars

**Total electricity consumption (GWh)**
- US states: EIA State Energy Data System (SEDS)
- Europe: Eurostat nrg_cb_e — total final electricity consumption

**Per capita net income**
- US states: Wikipedia (sourced from BEA) — per capita personal income minus estimated 22% combined taxes
- Europe: Eurostat ILC-DI03 — mean equivalised net disposable income, PPS converted to USD at ~1 PPS = $1.07

## Auto-updating

A GitHub Action runs on the 1st of every month: it fetches fresh data from all sources, rebuilds the site, and deploys automatically.

No API key. No secrets. No maintenance required.

To trigger manually: **Actions → Update Data & Deploy → Run workflow**

## Running locally

```bash
npm install
npm run dev
```

To test the data fetch:

```bash
node scripts/fetch-data.js
npm run build
```

## Built with

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- Wikipedia API (US GDP and income data)
- IMF DataMapper API (European GDP PPP data)
- EIA SEDS (US electricity data)
- Eurostat API (European electricity and income data)

## License

MIT
