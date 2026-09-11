/**
 * credentialVault.ts
 *
 * Encrypts/decrypts provider credentials using AES-256-GCM.
 * Never stores raw credentials. Key is derived from INFRA_ENCRYPTION_KEY env var.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = "unwire-infra-vault-v1";

function getKey(): Buffer {
  const secret =
    process.env.INFRA_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production"
      ? (() => {
          throw new Error(
            "INFRA_ENCRYPTION_KEY must be set in production (used to encrypt stored server credentials)."
          );
        })()
      : "unwire-dev-vault-key-do-not-use-in-production");
  return scryptSync(secret, SALT, 32);
}

/**
 * Encrypt credentials object → base64 string for DB storage.
 */
export function encryptCredentials(creds: Record<string, string>): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(creds);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt base64 string from DB → credentials object.
 */
export function decryptCredentials(encrypted: string): Record<string, string> {
  if (!encrypted) return {};

  const key = getKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted credential format.");

  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}
