import { generateKeyPairSync } from "node:crypto";

try {
  const { publicKey, privateKey } = generateKeyPairSync("ml-dsa-65");

  console.log("SUCCESS");
  console.log("Public:", publicKey.asymmetricKeyType);
  console.log("Private:", privateKey.asymmetricKeyType);
} catch (error) {
  console.error(error);
}
