/** @type {import('dependency-cruiser').IConfiguration} */

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "shared-must-not-import-project",
      severity: "error",
      from: {
        path: "^packages/shared",
      },
      to: {
        path: "^packages/(?!shared)",
      },
    },
    {
      name: "policy-must-not-depend-on-runtime",
      severity: "error",
      from: {
        path: "^packages/policy",
      },
      to: {
        path: "^packages/runtime",
      },
    },
    {
      name: "gateway-must-not-depend-on-api",
      severity: "error",
      from: {
        path: "^packages/execution-gateway",
      },
      to: {
        path: "^packages/api",
      },
    },
    {
      name: "connector-must-not-call-api",
      severity: "error",
      from: {
        path: "^packages/connector-sdk",
      },
      to: {
        path: "^packages/api",
      },
    },
  ],
  options: {
    tsConfig: {
      fileName: "tsconfig.json",
    },
    exclude: {
      path: ["dist", "node_modules"],
    },
  },
};
