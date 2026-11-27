# Packages

[Back to the README](https://github.com/pavancharak/parmana-core/blob/main/README.md) · [Developer docs index](README.md)

## Packages

The SDKs and the command-line tool share one version, which is 5.0.0 in this repository (see each package's `package.json`). The verifier is released from its own repository and has its own version.

| Package                  | Registry | Install                              |
| ------------------------ | -------- | ------------------------------------ |
| `@parmana/sdk`           | npm      | `npm install @parmana/sdk`           |
| `parmana`                | PyPI     | `pip install parmana`                |
| `@parmana/connector-sdk` | npm      | `npm install @parmana/connector-sdk` |
| `parmana-connector-sdk`  | PyPI     | `pip install parmana-connector-sdk`  |
| `@parmana/verifier`      | npm      | `npm install -g @parmana/verifier`   |
| `parmana-verifier`       | PyPI     | `pip install parmana-verifier`       |
| `@parmana/cli`           | npm      | `npm install -g @parmana/cli`        |

The command-line tool is also published as a container image, `ghcr.io/pavancharak/parmana-cli:<version>`, where `<version>` is the release you want, such as the version above. See [packages/cli/README.md](https://github.com/pavancharak/parmana-core/blob/main/packages/cli/README.md) for how to run it.

The verifier lives in its own repository, [pavancharak/parmana-verifier](https://github.com/pavancharak/parmana-verifier). The release history for the SDKs is in the [changelog](https://docs.parmanasystems.com/changelog).
