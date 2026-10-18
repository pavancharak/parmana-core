//
// Loaded with `node --import` into the fresh verification process.
// Blocks every network entry point and every read of a private key file,
// and reports each blocked attempt on exit. This is a second layer: the
// verifier process is also run in an empty network namespace (unshare -rn)
// by the test. Together they show the process cannot reach Parmana's
// services or read signing key material.
//
import fs from "node:fs";
import net from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";

const attempts = [];

const block = (kind) => {
  attempts.push(kind);
  throw new Error(`proof-audit: blocked ${kind}`);
};

net.Socket.prototype.connect = function () {
  return block("net.Socket.connect");
};
dns.lookup = (...args) => {
  const cb = args[args.length - 1];
  attempts.push("dns.lookup");
  cb(new Error("proof-audit: blocked dns.lookup"));
};
http.request = () => block("http.request");
https.request = () => block("https.request");
globalThis.fetch = async () => block("fetch");

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function (path, ...rest) {
  if (typeof path === "string" && /private/i.test(path)) {
    return block(`readFileSync(${path})`);
  }
  return originalReadFileSync.call(fs, path, ...rest);
};

process.on("exit", () => {
  process.stderr.write(
    `PROOF_AUDIT_BLOCKED:${JSON.stringify(attempts)}\n`,
  );
});
