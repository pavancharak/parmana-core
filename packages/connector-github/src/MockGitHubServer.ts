import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export interface MockGitHubServerOptions {
  /** The installation token this server issues from access_tokens and accepts as Bearer auth. */
  readonly installationToken: string;
}

interface MockPullRequest {
  number: number;
  mergeable: boolean | null;
  mergedAt: string | null;
  headSha: string;
  baseRef: string;
}

/**
 * Local, in-memory stand-in for the three GitHub REST endpoints this
 * connector uses, hermetic and deterministic — same discipline as
 * MockHubSpotServer. Never makes or receives real network traffic beyond
 * localhost.
 *
 * `POST /app/installations/:id/access_tokens` does not verify the App
 * JWT's signature (that would require this mock to hold the App's
 * private/public keypair, which belongs to the credential-provider tests
 * instead — see GitHubAppJwt.test.ts for signature-correctness coverage
 * in isolation from any network call). It only checks that a
 * non-empty Bearer token was presented, mirroring how narrowly
 * MockHubSpotServer's own `authenticates()` checks its Bearer token.
 */
export class MockGitHubServer {
  private server: Server | undefined;
  private baseUrlValue = "";
  private readonly pullRequests = new Map<string, MockPullRequest>();
  private mergeCallCount = 0;

  constructor(private readonly options: MockGitHubServerOptions) {}

  get baseUrl(): string {
    return this.baseUrlValue;
  }

  get mergeCalls(): number {
    return this.mergeCallCount;
  }

  setPullRequest(owner: string, repo: string, pr: MockPullRequest): void {
    this.pullRequests.set(`${owner}/${repo}#${pr.number}`, pr);
  }

  getPullRequest(
    owner: string,
    repo: string,
    number: number,
  ): MockPullRequest | undefined {
    return this.pullRequests.get(`${owner}/${repo}#${number}`);
  }

  async listen(): Promise<void> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: error instanceof Error ? error.message : "unknown error",
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, "127.0.0.1", resolve),
    );
    const address = this.server!.address() as AddressInfo;
    this.baseUrlValue = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    if (this.server === undefined) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = req.url ?? "";
    const method = req.method ?? "GET";
    const path = url.split("?")[0] ?? url;

    const accessTokenMatch =
      /^\/app\/installations\/([^/]+)\/access_tokens$/.exec(path);
    if (method === "POST" && accessTokenMatch) {
      this.handleMintInstallationToken(req, res);
      return;
    }

    if (!this.authenticates(req)) {
      this.respond(res, 401, { message: "Bad credentials" });
      return;
    }

    const pullMatch = /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/.exec(path);
    if (method === "GET" && pullMatch) {
      this.handleFetchPullRequest(
        res,
        pullMatch[1]!,
        pullMatch[2]!,
        Number(pullMatch[3]),
      );
      return;
    }

    const mergeMatch = /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/merge$/.exec(
      path,
    );
    if (method === "PUT" && mergeMatch) {
      const body = await this.readJsonBody(req);
      this.handleMergePullRequest(
        res,
        mergeMatch[1]!,
        mergeMatch[2]!,
        Number(mergeMatch[3]),
        body,
      );
      return;
    }

    this.respond(res, 404, { message: "Not Found" });
  }

  private handleMintInstallationToken(
    req: IncomingMessage,
    res: ServerResponse,
  ): void {
    const header = req.headers.authorization;
    if (
      header === undefined ||
      !header.startsWith("Bearer ") ||
      header.slice("Bearer ".length).length === 0
    ) {
      this.respond(res, 401, {
        message: "A JSON web token could not be decoded",
      });
      return;
    }
    this.respond(res, 201, {
      token: this.options.installationToken,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
  }

  private handleFetchPullRequest(
    res: ServerResponse,
    owner: string,
    repo: string,
    number: number,
  ): void {
    const pr = this.pullRequests.get(`${owner}/${repo}#${number}`);
    if (pr === undefined) {
      this.respond(res, 404, { message: "Not Found" });
      return;
    }
    this.respond(res, 200, {
      number: pr.number,
      mergeable: pr.mergeable,
      merged_at: pr.mergedAt,
      head: { sha: pr.headSha },
      base: { ref: pr.baseRef },
    });
  }

  private handleMergePullRequest(
    res: ServerResponse,
    owner: string,
    repo: string,
    number: number,
    body: Record<string, unknown>,
  ): void {
    const key = `${owner}/${repo}#${number}`;
    const pr = this.pullRequests.get(key);
    if (pr === undefined) {
      this.respond(res, 404, { message: "Not Found" });
      return;
    }

    if (typeof body.sha === "string" && body.sha !== pr.headSha) {
      this.respond(res, 422, {
        message: "Head branch was modified. Review and try the merge again.",
      });
      return;
    }

    this.mergeCallCount += 1;

    const merged: MockPullRequest = {
      ...pr,
      mergedAt: new Date().toISOString(),
    };
    this.pullRequests.set(key, merged);

    this.respond(res, 200, {
      sha: `merged-${pr.headSha}`,
      merged: true,
      message: `Pull Request successfully merged using ${(body.merge_method as string) ?? "merge"}`,
    });
  }

  private authenticates(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith("Bearer ")) return false;
    return header.slice("Bearer ".length) === this.options.installationToken;
  }

  private async readJsonBody(
    req: IncomingMessage,
  ): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw.length === 0) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private respond(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}
