import { ReplayEngine } from "./ReplayEngine.js";

import type { ReplayRequest } from "./types/ReplayRequest.js";

export class ReplayBuilder {
  constructor(private readonly request: ReplayRequest) {}

  build(): ReplayEngine {
    return new ReplayEngine();
  }
}
