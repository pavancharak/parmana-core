import { createVerify } from "node:crypto";

/**
 * Verifies a message from Amazon SNS before anything in it is trusted. The message is checked
 * against its signature, using the certificate SNS names, and that certificate must come from an
 * SNS host. A message that fails the check is refused.
 */

export interface SnsEnvelope {
  readonly Type: string;
  readonly MessageId: string;
  readonly TopicArn: string;
  readonly Message: string;
  readonly Timestamp: string;
  readonly SignatureVersion: string;
  readonly Signature: string;
  readonly SigningCertURL: string;
  readonly Subject?: string;
  readonly Token?: string;
  readonly SubscribeURL?: string;
}

/** A message that is not from SNS, or whose signature does not match. */
export class SnsRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnsRefused";
  }
}

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/** An SNS address must be https, on an SNS host. Anything else is refused before it is fetched. */
export function requireSnsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SnsRefused("The SNS address is not a URL.");
  }
  if (url.protocol !== "https:" || !SNS_HOST.test(url.hostname)) {
    throw new SnsRefused(`The SNS address ${url.hostname} is not an SNS host.`);
  }
  return url;
}

/** The string SNS signs: the fields in a fixed order, each as name, newline, value, newline. */
export function canonicalSnsString(envelope: SnsEnvelope): string {
  const fields: Array<[string, string]> =
    envelope.Type === "Notification"
      ? [
          ["Message", envelope.Message],
          ["MessageId", envelope.MessageId],
          ...(envelope.Subject !== undefined
            ? [["Subject", envelope.Subject] as [string, string]]
            : []),
          ["Timestamp", envelope.Timestamp],
          ["TopicArn", envelope.TopicArn],
          ["Type", envelope.Type],
        ]
      : [
          ["Message", envelope.Message],
          ["MessageId", envelope.MessageId],
          ["SubscribeURL", envelope.SubscribeURL ?? ""],
          ["Timestamp", envelope.Timestamp],
          ["Token", envelope.Token ?? ""],
          ["TopicArn", envelope.TopicArn],
          ["Type", envelope.Type],
        ];
  return fields.map(([name, value]) => `${name}\n${value}\n`).join("");
}

/**
 * Checks the signature of an SNS message. `fetchCertificate` returns the PEM certificate at the
 * URL the message names. Throws SnsRefused if the message does not verify.
 */
export async function verifySnsEnvelope(
  envelope: SnsEnvelope,
  fetchCertificate: (url: string) => Promise<string>,
): Promise<void> {
  const url = requireSnsUrl(envelope.SigningCertURL);
  const algorithm =
    envelope.SignatureVersion === "1"
      ? "RSA-SHA1"
      : envelope.SignatureVersion === "2"
        ? "RSA-SHA256"
        : undefined;
  if (algorithm === undefined)
    throw new SnsRefused("The SNS signature version is not known.");
  const certificate = await fetchCertificate(url.toString());
  const verifier = createVerify(algorithm);
  verifier.update(canonicalSnsString(envelope));
  let valid: boolean;
  try {
    valid = verifier.verify(certificate, envelope.Signature, "base64");
  } catch {
    valid = false;
  }
  if (!valid)
    throw new SnsRefused("The SNS signature does not match the message.");
}
