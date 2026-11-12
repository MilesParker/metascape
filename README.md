# Metascape

Agent-based modelling for the web: a typed, deterministic simulation engine, a strongly typed
metamodel, and React tooling for building, running and exploring models.

Metascape is the successor to [Ascape](https://github.com/MilesParker/ascape) and the
[Eclipse Agent Modeling Platform](https://github.com/MilesParker/amp). It is a new design in
TypeScript, not a port, and is not source-compatible with either.

**Status:** early scaffold. The engine currently contains only the seeded random number generator.

## Layout

| Path              | Package             | Purpose                                   |
| ----------------- | ------------------- | ----------------------------------------- |
| `packages/engine` | `@metascape/engine` | Headless, deterministic simulation engine |
| `apps/studio`     | `@metascape/studio` | Browser app for running models            |

## Development

Requires Node 24 or later.

```bash
npm install
npm run dev     # start Studio
npm run check   # format check, lint, typecheck, tests, build
```

## Principles

- **Deterministic.** A run is fully determined by its model, parameters and seed.
- **Strongly typed.** Models are checked by the compiler and validated when loaded.
- **Headless first.** The engine has no UI dependencies and runs in Node, browsers and workers.

## License

[Eclipse Public License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
