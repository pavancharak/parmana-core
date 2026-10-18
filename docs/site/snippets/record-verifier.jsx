// In browser verifier for Parmana Execution Trust Records, used by
// docs/site/verification/verify-in-browser.mdx. It runs entirely in the
// reader's browser with Web Crypto: nothing is uploaded.
//
// verifyParmanaTrustRecord, defined inside RecordVerifier, must match @parmana/sign's
// verifyExecutionTrustRecordOffline for the hash and the ed25519
// `signature` field. tests/architecture/browser-record-verifier.test.ts
// runs the code between the BEGIN and END markers against records signed
// by Parmana's own signer, and compares the result with @parmana/crypto.

export const RecordVerifier = ({ exampleRecord, examplePublicKey }) => {
  // Defined inside the component: Mintlify renders each exported
  // component on its own, so a helper outside it is not available.
  // BEGIN verifyParmanaTrustRecord
  const verifyParmanaTrustRecord = async (record, publicKeyPem) => {
    const subtle = globalThis.crypto.subtle;
    const encoder = new TextEncoder();
    const errors = [];
    const notes = [];

    // Same rules as @parmana/sign's CanonicalSerializer: object keys sorted,
    // array order kept, then JSON.stringify.
    const normalize = (value) => {
      if (value === null || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(normalize);
      return Object.keys(value)
        .sort()
        .reduce((out, key) => {
          Object.defineProperty(out, key, {
            value: normalize(value[key]),
            enumerable: true,
            writable: true,
            configurable: true,
          });
          return out;
        }, {});
    };
    const canonicalBytes = (value) =>
      encoder.encode(JSON.stringify(normalize(value)));
    const hex = (buffer) =>
      Array.from(new Uint8Array(buffer), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    const fromBase64 = (text) =>
      Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

    if (
      typeof record !== "object" ||
      record === null ||
      Array.isArray(record)
    ) {
      return {
        valid: false,
        hashValid: false,
        signatureValid: false,
        errors: ["The record is not a JSON object."],
        notes,
      };
    }

    // The fields Parmana hashes and signs (ExecutionTrustRecordCanonicalView).
    const view = {
      trustRecordId: record.trustRecordId,
      businessTransactionId: record.businessTransactionId,
      transaction: record.transaction,
      authorization: record.authorization,
      overrides: record.overrides,
      executions: record.executions,
      createdAt: record.createdAt,
    };
    const bytes = canonicalBytes(view);

    const digest = hex(await subtle.digest("SHA-256", bytes));
    const hashValid = digest === record.trustRecordHash;
    if (!hashValid) {
      errors.push(
        `trustRecordHash does not match the content: computed ${digest}, record says ${String(record.trustRecordHash)}.`,
      );
    }

    const signature = record.signature;
    let signatureValid = false;
    let signedForm;
    if (
      typeof signature !== "object" ||
      signature === null ||
      typeof signature.value !== "string"
    ) {
      errors.push("The record has no signature.");
    } else if (signature.algorithm !== "ed25519") {
      errors.push(
        `The signature algorithm is ${String(signature.algorithm)}; this page checks ed25519 only. Use @parmana/sign.`,
      );
    } else {
      try {
        const der = fromBase64(
          String(publicKeyPem)
            .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
            .replace(/\s+/g, ""),
        );
        const key = await subtle.importKey(
          "spki",
          der,
          { name: "Ed25519" },
          false,
          ["verify"],
        );
        const signatureBytes = fromBase64(signature.value);
        if (
          await subtle.verify({ name: "Ed25519" }, key, signatureBytes, bytes)
        ) {
          signatureValid = true;
          signedForm = "raw";
        } else if (bytes.length > 4096) {
          // Messages over 4096 bytes may be signed as a commitment
          // (ADR-0010): a fixed prefix, then the SHA-512 of the message.
          const prefix = encoder.encode("PARMANA-ED25519-LARGE-MESSAGE-V1\0");
          const sha512 = new Uint8Array(await subtle.digest("SHA-512", bytes));
          const commitment = new Uint8Array(prefix.length + sha512.length);
          commitment.set(prefix);
          commitment.set(sha512, prefix.length);
          if (
            await subtle.verify(
              { name: "Ed25519" },
              key,
              signatureBytes,
              commitment,
            )
          ) {
            signatureValid = true;
            signedForm = "commitment";
          }
        }
        if (!signatureValid) {
          errors.push(
            `The signature does not verify with this public key. The record names key "${String(signature.keyId)}"; check that the key you pasted is that key.`,
          );
        }
      } catch (error) {
        const name = error && error.name;
        errors.push(
          name === "NotSupportedError"
            ? "This browser does not support Ed25519 in Web Crypto. Use a current Chrome, Edge, Firefox or Safari, or @parmana/sign."
            : `The public key or signature could not be read: ${error && error.message ? error.message : String(error)}`,
        );
      }
    }

    if (Array.isArray(record.signatures) && record.signatures.length > 0) {
      notes.push(
        "The record also carries a hybrid signatures array (for example ML-DSA-65). This page does not check it; @parmana/sign does.",
      );
    }

    return {
      valid: hashValid && signatureValid,
      hashValid,
      signatureValid,
      keyId: signature && signature.keyId,
      signedForm,
      errors,
      notes,
    };
  };
  // END verifyParmanaTrustRecord

  const [recordText, setRecordText] = useState("");
  const [keyText, setKeyText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (text, pem) => {
    setBusy(true);
    try {
      let record;
      try {
        record = JSON.parse(text);
      } catch (error) {
        setResult({
          valid: false,
          errors: [`The record is not valid JSON: ${error.message}`],
          notes: [],
        });
        return;
      }
      if (!pem.trim()) {
        setResult({
          valid: false,
          errors: ["Paste the public key (PEM) that signed the record."],
          notes: [],
        });
        return;
      }
      setResult(await verifyParmanaTrustRecord(record, pem));
    } catch (error) {
      setResult({
        valid: false,
        errors: [
          `Verification could not run: ${error && error.message ? error.message : String(error)}`,
        ],
        notes: [],
      });
    } finally {
      setBusy(false);
    }
  };

  const loadExample = () => {
    const text = JSON.stringify(exampleRecord, null, 2);
    setRecordText(text);
    setKeyText(examplePublicKey);
    setResult(null);
  };

  const loadChangedExample = () => {
    const changed = JSON.parse(JSON.stringify(exampleRecord));
    changed.transaction.signals.amount = 100000;
    const text = JSON.stringify(changed, null, 2);
    setRecordText(text);
    setKeyText(examplePublicKey);
    setResult(null);
  };

  const fetchSandboxKey = async () => {
    try {
      const response = await fetch(
        "https://parmana-sandbox.vercel.app/keys/default",
      );
      const body = await response.json();
      setKeyText(body.pem);
    } catch (error) {
      setResult({
        valid: false,
        errors: [`Could not fetch the sandbox key: ${error.message}`],
        notes: [],
      });
    }
  };

  const box = {
    width: "100%",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "12px",
    padding: "8px",
    borderRadius: "8px",
    border: "1px solid rgba(127, 127, 127, 0.4)",
    background: "transparent",
    color: "inherit",
  };
  const button = {
    padding: "6px 12px",
    marginRight: "8px",
    marginTop: "8px",
    borderRadius: "8px",
    border: "1px solid rgba(127, 127, 127, 0.4)",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
  };

  return (
    <div>
      <label htmlFor="parmana-record">Execution Trust Record (JSON)</label>
      <textarea
        id="parmana-record"
        rows={12}
        style={box}
        value={recordText}
        onChange={(event) => setRecordText(event.target.value)}
        placeholder='{"trustRecordId": "...", "trustRecordHash": "...", "signature": {...}}'
      />
      <label htmlFor="parmana-key">Public key (PEM)</label>
      <textarea
        id="parmana-key"
        rows={4}
        style={box}
        value={keyText}
        onChange={(event) => setKeyText(event.target.value)}
        placeholder="-----BEGIN PUBLIC KEY-----"
      />
      <div>
        <button
          type="button"
          style={{ ...button, fontWeight: 600 }}
          disabled={busy}
          onClick={() => run(recordText, keyText)}
        >
          Verify
        </button>
        <button type="button" style={button} onClick={loadExample}>
          Load the example
        </button>
        <button type="button" style={button} onClick={loadChangedExample}>
          Load the example, changed
        </button>
        <button type="button" style={button} onClick={fetchSandboxKey}>
          Use the sandbox key
        </button>
      </div>
      {result && (
        <div
          role="status"
          style={{
            marginTop: "12px",
            padding: "12px",
            borderRadius: "8px",
            border: `1px solid ${result.valid ? "rgba(22, 163, 74, 0.6)" : "rgba(220, 38, 38, 0.6)"}`,
          }}
        >
          <strong>
            {result.valid
              ? "Valid: the hash matches and the signature verifies."
              : "Not valid."}
          </strong>
          {result.hashValid !== undefined && (
            <ul>
              <li>
                Hash:{" "}
                {result.hashValid ? "matches the content" : "does not match"}
              </li>
              <li>
                Signature:{" "}
                {result.signatureValid
                  ? `verifies (key "${result.keyId}", ${result.signedForm} form)`
                  : "does not verify"}
              </li>
            </ul>
          )}
          {result.errors.length > 0 && (
            <ul>
              {result.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {result.notes.length > 0 && (
            <ul>
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
