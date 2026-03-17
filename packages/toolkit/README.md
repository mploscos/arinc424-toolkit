# @arinc424/toolkit

Convenience metapackage that bundles the public APIs from:

- `@arinc424/core`
- `@arinc424/features`
- `@arinc424/procedures`
- `@arinc424/analysis`
- `@arinc424/tiles`
- `@arinc424/3dtiles`
- `@arinc424/view`

Use this package when you prefer a single dependency over modular package-by-package installs.

Installing `@arinc424/toolkit` also exposes the `arinc` executable:

```bash
npm install @arinc424/toolkit
arinc --help
```

The published package ships:

- `src/index.js` for the metapackage API surface
- `src/cli.js` for CLI orchestration
- `bin/arinc.js` as the published launcher
