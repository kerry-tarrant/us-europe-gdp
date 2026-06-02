# US States vs. European Nations - GDP per Capita

[![Update Data & Deploy](https://github.com/kerry-tarrant/us-europe-gdp/actions/workflows/update-and-deploy.yml/badge.svg)](https://github.com/kerry-tarrant/us-europe-gdp/actions/workflows/update-and-deploy.yml)

An interactive data visualization comparing US state GDP per capita to European countries.

**Live site:** https://kerry-tarrant.github.io/us-europe-gdp/

## Data Sources

- **US states:** Wikipedia (sourced from BEA) - nominal GDP per capita, auto-updated annually
- **Europe:** IMF World Economic Outlook - GDP per capita PPP, international dollars, auto-updated annually

## Auto-updating

Every April 29th, a GitHub Action fetches fresh data from both sources, rebuilds the site, and deploys automatically.

No API key. No secrets. No maintenance required.

To trigger manually: **Actions -> Update Data & Deploy -> Run workflow**

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
- Wikipedia API (US state GDP data)
- IMF DataMapper API (European PPP data)

## License

MIT
