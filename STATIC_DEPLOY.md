# GitHub Pages deployment

The `static` branch builds a static PWA for:

```text
https://yukina149.github.io/countsite/
```

## First-time setup

Open the repository on GitHub and select:

```text
Settings > Pages > Build and deployment > Source: GitHub Actions
```

## Deploy

Push the `static` branch. The workflow at `.github/workflows/deploy-pages.yml` builds and deploys the site automatically. It can also be run manually from the Actions tab.

## Local validation

```bash
pnpm install
pnpm test
```
