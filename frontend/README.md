# TaskFlow frontend

Angular 21 (standalone components, signals) with NG-ZORRO. Conventions and commands: see the repository
[CLAUDE.md](../CLAUDE.md); design: [docs/ui-design/design-plan.md](../docs/ui-design/design-plan.md).

```bash
npx -y npm@11 install      # npm 10.9 crashes resolving this dependency tree ("edgesOut"); npm 11 does not
npm start                  # http://localhost:4200, proxies /api to http://localhost:5095
npm test                   # Vitest through `ng test`
npm run build              # production build in dist/
```

Requires Node 22 (see `.nvmrc`) and the backend running for anything that calls the API.
