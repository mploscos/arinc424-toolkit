# Testing and Quality Strategy

## Overview

Quality checks are split across:

- Package unit/regression tests
- Golden contract tests
- CLI smoke tests
- Determinism checks
- Lightweight benchmarks

## Run tests

```bash
npm test
npm run test:golden
npm run test:smoke
```

## Golden files

Goldens are stored under `test/golden/` and include:

- canonical model outputs
- feature model outputs
- tile manifest + sample layer/tile outputs
- 3D tiles summary metadata

### Update goldens intentionally

```bash
npm run update:golden
```

This regenerates fixtures and goldens from the current code. Review diffs before committing.

## Determinism checks

Determinism tests verify that two runs with identical input produce identical:

- canonical model
- feature model
- tiled JSON outputs + manifest

Dynamic timestamps are controlled to avoid nondeterministic noise.

## Benchmarks

Lightweight benches are available and safe for local/CI optional runs.

```bash
npm run bench
npm run bench -w @arinc/core
npm run bench -w @arinc/features
npm run bench -w @arinc/tiles
```

## Release readiness checklist (v0.1.0)

- [ ] `npm test` passes
- [ ] `npm run test:golden` passes
- [ ] `npm run test:smoke` passes
- [ ] `npm run bench` completes without errors
- [ ] Golden diffs reviewed and approved
- [ ] Fixture README and testing docs are current
