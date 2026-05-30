# GDP per Capita: US States and European Nations

An interactive data visualization comparing US state GDP per capita to European countries.

**Live site:** https://kerry-tarrant.github.io/us-europe-gdp/

## Data Sources

- **US states:** nominal GDP per capita comes from [Bureau of Economic Analysis](https://www.bea.gov/data/gdp/gdp-state)
- **Europe:** GDP per capita PPP, international dollars, comes from [IMF World Economic Outlook](https://data.imf.org/en/datasets/IMF.RES:WEO)

## Auto-updating

Every April 29th, a GitHub Action fetches fresh data from the BEA and IMF APIs, rebuilds the site, and deploys it automatically. The IMF publishes its WEO database in mid-April; BEA annual state GDP figures are typically available by late March.

### One-time setup required

The BEA API requires a free key:

1. Register at https://apps.bea.gov/api/signup/
2. In your GitHub repo, go to **Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions**
3. Add a secret named `BEA_API_KEY` with your key as the value

The IMF DataMapper API requires no key.

### Manual trigger

You can also trigger the update manually anytime via **Actions $\rightarrow$ Update Data & Deploy $\rightarrow$ Run workflow**.

## Running locally

```bash
npm install
npm run dev
```

To test the data fetch locally:

```bash
BEA_API_KEY=your_key_here node scripts/fetch-data.js
npm run build
```

## Built with

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- BEA Regional API
- IMF DataMapper API
