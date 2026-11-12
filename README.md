# Parmana

[![CI](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](package.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/pavancharak/parmana-core/badge)](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15846/badge)](https://www.bestpractices.dev/projects/15846)

**Parmana makes sure every caller takes only the actions your business has approved, even when they could technically do more.** It checks every action, whether a person or a machine takes it, against the limits you set, and keeps signed proof of what happened.

## Quick start

Needs Node.js 24 or later. No `.env` file or credentials.

```bash
npm ci
npm run build
npm test
npm run evaluate
```

Other ways to run it (local server, Docker): [docs/dev/RUNNING.md](docs/dev/RUNNING.md).

## Learn more

| Topic | Read |
| --- | --- |
| What it does, and its limits | [docs/dev/OVERVIEW.md](docs/dev/OVERVIEW.md) |
| Architecture | [docs/dev/ARCHITECTURE.md](docs/dev/ARCHITECTURE.md) |
| Connect a system you run | [docs/dev/CONNECTORS.md](docs/dev/CONNECTORS.md) |
| Packages, SDKs and CLI | [docs/dev/PACKAGES.md](docs/dev/PACKAGES.md) |
| Tests, evidence and status | [docs/dev/STATUS-AND-EVIDENCE.md](docs/dev/STATUS-AND-EVIDENCE.md) |
| Contributing, security and license | [docs/dev/COMMUNITY.md](docs/dev/COMMUNITY.md) |
| Everything, indexed | [docs/dev/README.md](docs/dev/README.md) |

Hosted docs: [docs.parmanasystems.com](https://docs.parmanasystems.com).

## Contributing, security and license

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a vulnerability, follow [SECURITY.md](SECURITY.md), and do not open a public issue. Licensed under [Apache 2.0](LICENSE).
