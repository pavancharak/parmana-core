// Stand-in for a downstream system, used only by the offline check
// (docker-compose.offline-check.yml). It plays the part of
// parmana-paytm-agent: the service the API hands an authorized refund to.
//
// It serves HTTPS, because the API refuses a plaintext connector URL in
// production, with a certificate made for the run. It answers
// POST /connector/paytm-refund the way the real agent does, and
// before answering it verifies the Execution Gateway's signature over the
// authorization with only the gateway's PUBLIC key (mounted at
// /public-keys). A request the gateway did not sign is refused. It never
// calls Paytm or anything else. GET /calls reports how many refunds it
// accepted, so the check can prove a refused request never reached it.

import { Buffer } from "node:buffer";
import { verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";

import {
  PAYTM_AGENT_WIRE_ACTION,
  canonicalPaytmAuthorizationString,
} from "@parmana/connector-paytm";

const port = Number(process.env.PORT ?? 4399);
const sharedSecret = process.env.PAYTM_CONNECTOR_SHARED_SECRET;

if (!sharedSecret) {
  console.error(
    "[paytm-agent-stand-in] PAYTM_CONNECTOR_SHARED_SECRET is not set",
  );
  process.exit(1);
}

let accepted = 0;

function respond(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length === 0 ? {} : JSON.parse(raw);
}

const tls = {
  key: readFileSync("/certs/stand-in.key"),
  cert: readFileSync("/certs/stand-in.crt"),
};

createServer(tls, async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/calls") {
      respond(res, 200, { accepted });
      return;
    }

    if (req.method !== "POST" || req.url !== "/connector/paytm-refund") {
      respond(res, 404, { error: "not_found" });
      return;
    }

    if (req.headers.authorization !== `Bearer ${sharedSecret}`) {
      respond(res, 401, { error: "unauthorized" });
      return;
    }

    const body = await readJson(req);
    const transaction = body.transaction ?? {};
    const intent = transaction.intent ?? {};
    const parameters = intent.parameters ?? {};
    const authorization = body.authorization ?? {};
    const payload = authorization.payload ?? {};

    if (intent.action !== PAYTM_AGENT_WIRE_ACTION) {
      throw new Error("unsupported connector action");
    }

    if (payload.businessTransactionId !== transaction.businessTransactionId) {
      throw new Error("authorization is not bound to the business transaction");
    }

    const expiresAt = Number(payload.expiresAt);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      throw new Error("authorization is missing an expiry or has expired");
    }

    const keyId = String(authorization.keyId ?? "");
    if (!/^[A-Za-z0-9_-]+$/.test(keyId)) {
      throw new Error("authorization.keyId is missing or malformed");
    }

    const publicKey = readFileSync(`/public-keys/${keyId}.public.pem`, "utf8");
    const canonical = canonicalPaytmAuthorizationString({
      businessTransactionId: transaction.businessTransactionId,
      action: intent.action,
      orderId: String(parameters.orderId),
      txnId: String(parameters.txnId),
      amount: String(parameters.amount),
      expiresAt,
    });

    const signatureValid = verify(
      null,
      Buffer.from(canonical, "utf8"),
      publicKey,
      Buffer.from(String(authorization.signature ?? ""), "base64"),
    );

    if (!signatureValid) {
      throw new Error("authorization signature is invalid");
    }

    accepted += 1;
    console.log(
      `[paytm-agent-stand-in] accepted refund for ${transaction.businessTransactionId}, ` +
        `gateway signature verified with key "${keyId}"`,
    );

    respond(res, 200, {
      businessTransactionId: transaction.businessTransactionId,
      action: intent.action,
      target: String(intent.target ?? ""),
      parameters: {
        orderId: String(parameters.orderId),
        txnId: String(parameters.txnId),
        refId: String(parameters.refId),
        amount: String(parameters.amount),
      },
      success: true,
      executedAt: new Date().toISOString(),
      metadata: {
        provider: "offline-stand-in",
        resultStatus: "S",
        resultCode: "00",
      },
    });
  } catch (error) {
    console.log(
      `[paytm-agent-stand-in] refused: ${error instanceof Error ? error.message : error}`,
    );
    respond(res, 500, {
      error: error instanceof Error ? error.message : "request failed",
    });
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`[paytm-agent-stand-in] listening on ${port}`);
});
