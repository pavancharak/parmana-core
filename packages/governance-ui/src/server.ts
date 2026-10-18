import "dotenv/config";

import { loadGovernanceUiConfig } from "./config.js";
import { createGovernanceUiApp } from "./app.js";

const config = loadGovernanceUiConfig();

const app = createGovernanceUiApp(config);

app.listen(config.port, () => {
  console.log(
    `Policy Governance UI running on http://localhost:${config.port} ` +
      `(talking to ${config.apiBaseUrl})`,
  );
});
