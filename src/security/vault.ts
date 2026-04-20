/**
 * Secrets vault with credential isolation — AES-256-GCM encryption.
 *
 * 1:1 port of colony/security/vault.py — centralises API keys, tokens,
 * and credentials behind a scope-based access control model. Agents never
 * see raw secrets directly — they request by logical name and the vault
 * resolves at execution time, enforcing caste and agent-level boundaries.
 *
 * Encryption: NIST AES-256-GCM via Node.js crypto module.
 * Key derivation: PBKDF2-HMAC-SHA256 with 100,000 iterations.
 *
 * File format: version(1) + salt(16) + iv(12) + authTag(16) + ciphertext
 */

import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

// ---------------------------------------------------------------------------
// Secret scope
// ---------------------------------------------------------------------------

export enum SecretScope {
  GLOBAL = "global",
  CASTE = "caste",
  AGENT = "agent",
}

// ---------------------------------------------------------------------------
// Secret reference (metadata only — never contains raw value)
// ---------------------------------------------------------------------------

export interface SecretRef {
  name: string;
  scope: SecretScope;
  ownerCaste: string | null;
  ownerAgentId: string | null;
  createdAt: string;
  rotatedAt: string | null;
  description: string;
}

export function createSecretRef(
  name: string,
  opts: Partial<Omit<SecretRef, "name">> = {},
): SecretRef {
  return {
    name,
    scope: opts.scope ?? SecretScope.GLOBAL,
    ownerCaste: opts.ownerCaste ?? null,
    ownerAgentId: opts.ownerAgentId ?? null,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    rotatedAt: opts.rotatedAt ?? null,
    description: opts.description ?? "",
  };
}

// ---------------------------------------------------------------------------
// Vault configuration
// ---------------------------------------------------------------------------

export interface VaultConfig {
  enableAuditLogging: boolean;
  storageDir: string;
  maxSecretSizeBytes: number;
}

export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  enableAuditLogging: true,
  storageDir: "~/.colony/vault",
  maxSecretSizeBytes: 65_536,
};

// ---------------------------------------------------------------------------
// Vault backend interface
// ---------------------------------------------------------------------------

export interface VaultBackend {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
  listNames(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Environment variable backend (zero-config default)
// ---------------------------------------------------------------------------

export class EnvVarBackend implements VaultBackend {
  private prefix: string;

  constructor(prefix = "COLONY_SECRET_") {
    this.prefix = prefix;
  }

  private envKey(name: string): string {
    if (name === name.toUpperCase() && name.includes("_")) {
      return name; // Already looks like an env var — use as-is
    }
    return `${this.prefix}${name.toUpperCase()}`;
  }

  async get(name: string): Promise<string | null> {
    return process.env[this.envKey(name)] ?? null;
  }

  async set(name: string, value: string): Promise<void> {
    process.env[this.envKey(name)] = value;
  }

  async delete(name: string): Promise<void> {
    delete process.env[this.envKey(name)];
  }

  async listNames(): Promise<string[]> {
    return Object.keys(process.env)
      .filter((k) => k.startsWith(this.prefix))
      .map((k) => k.slice(this.prefix.length).toLowerCase());
  }
}

// ---------------------------------------------------------------------------
// Encrypted file backend — AES-256-GCM (NIST-compliant)
// ---------------------------------------------------------------------------

const VERSION_GCM = 2;
const SALT_SIZE = 16;
const KEY_SIZE = 32;
const GCM_NONCE_SIZE = 12;
const GCM_TAG_SIZE = 16;
const ITERATIONS = 100_000;

export class EncryptedFileBackend implements VaultBackend {
  private path: string;
  private passphrase: string;
  private cache: Record<string, string> | null = null;

  constructor(storagePath: string, passphrase: string) {
    this.path = storagePath.startsWith("~")
      ? join(homedir(), storagePath.slice(1))
      : storagePath;
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.passphrase = passphrase;
  }

  // -- Key derivation -----------------------------------------------------

  private deriveKey(salt: Buffer): Buffer {
    return pbkdf2Sync(this.passphrase, salt, ITERATIONS, KEY_SIZE, "sha256");
  }

  // -- AES-256-GCM --------------------------------------------------------

  private encryptGcm(
    plaintext: Buffer,
    key: Buffer,
  ): { iv: Buffer; ciphertext: Buffer; authTag: Buffer } {
    const iv = randomBytes(GCM_NONCE_SIZE);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return { iv, ciphertext: encrypted, authTag };
  }

  private decryptGcm(
    iv: Buffer,
    ciphertext: Buffer,
    authTag: Buffer,
    key: Buffer,
  ): Buffer {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  // -- Load / Save --------------------------------------------------------

  private load(): Record<string, string> {
    if (this.cache !== null) return this.cache;

    if (!existsSync(this.path)) {
      this.cache = {};
      return this.cache;
    }

    const raw = readFileSync(this.path);

    // v2: version_byte(1) + salt(16) + iv(12) + authTag(16) + ciphertext
    const minV2 = 1 + SALT_SIZE + GCM_NONCE_SIZE + GCM_TAG_SIZE;
    if (raw.length >= minV2 && raw[0] === VERSION_GCM) {
      let off = 1;
      const salt = raw.subarray(off, off + SALT_SIZE);
      off += SALT_SIZE;
      const iv = raw.subarray(off, off + GCM_NONCE_SIZE);
      off += GCM_NONCE_SIZE;
      const authTag = raw.subarray(off, off + GCM_TAG_SIZE);
      off += GCM_TAG_SIZE;
      const ciphertext = raw.subarray(off);

      const key = this.deriveKey(Buffer.from(salt));
      try {
        const plaintext = this.decryptGcm(
          Buffer.from(iv),
          Buffer.from(ciphertext),
          Buffer.from(authTag),
          key,
        );
        this.cache = JSON.parse(plaintext.toString("utf-8"));
      } catch (e) {
        throw new VaultError(
          `Failed to decrypt vault file (v2/GCM): ${e}`,
        );
      }
      return this.cache!;
    }

    this.cache = {};
    return this.cache;
  }

  private save(data: Record<string, string>): void {
    const salt = randomBytes(SALT_SIZE);
    const plaintext = Buffer.from(JSON.stringify(data), "utf-8");
    const key = this.deriveKey(salt);
    const { iv, ciphertext, authTag } = this.encryptGcm(plaintext, key);

    // v2 format: version(1) + salt(16) + iv(12) + authTag(16) + ciphertext
    const output = Buffer.concat([
      Buffer.from([VERSION_GCM]),
      salt,
      iv,
      authTag,
      ciphertext,
    ]);

    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.path, output);

    this.cache = data;
  }

  // -- VaultBackend interface ---------------------------------------------

  async get(name: string): Promise<string | null> {
    const data = this.load();
    return data[name] ?? null;
  }

  async set(name: string, value: string): Promise<void> {
    const data = this.load();
    data[name] = value;
    this.save(data);
  }

  async delete(name: string): Promise<void> {
    const data = this.load();
    delete data[name];
    this.save(data);
  }

  async listNames(): Promise<string[]> {
    return Object.keys(this.load());
  }

  /** Re-encrypt the vault with a new passphrase (key rotation). */
  rotatePassphrase(newPassphrase: string): void {
    const data = this.load();
    this.passphrase = newPassphrase;
    this.cache = null;
    this.save(data);
    console.log("[vault] Passphrase rotated successfully");
  }
}

// ---------------------------------------------------------------------------
// Access log entry
// ---------------------------------------------------------------------------

interface AccessLogEntry {
  timestamp: string;
  secretName: string;
  requesterCaste: string;
  requesterAgentId: string;
  outcome: "allowed" | "denied";
  reason: string;
}

// ---------------------------------------------------------------------------
// SecretVault — central vault with scope-based access control
// ---------------------------------------------------------------------------

export class SecretVault {
  private backend: VaultBackend;
  private config: VaultConfig;
  private refs = new Map<string, SecretRef>();
  private accessLog: AccessLogEntry[] = [];

  constructor(backend?: VaultBackend, config?: Partial<VaultConfig>) {
    this.backend = backend ?? new EnvVarBackend();
    this.config = { ...DEFAULT_VAULT_CONFIG, ...config };
  }

  // -- Registration -------------------------------------------------------

  registerSecret(ref: SecretRef): void {
    this.refs.set(ref.name, ref);
    if (this.config.enableAuditLogging) {
      console.log(
        `[vault] Registered secret: ${ref.name} (scope=${ref.scope}, caste=${ref.ownerCaste ?? "*"}, agent=${ref.ownerAgentId ?? "*"})`,
      );
    }
  }

  getRef(name: string): SecretRef | undefined {
    return this.refs.get(name);
  }

  // -- Access control -----------------------------------------------------

  private checkAccess(
    ref: SecretRef,
    requesterCaste: string,
    requesterAgentId: string,
  ): [boolean, string] {
    if (ref.scope === SecretScope.GLOBAL) {
      return [true, "global scope"];
    }
    if (ref.scope === SecretScope.CASTE) {
      if (!ref.ownerCaste) {
        return [true, "caste scope with no owner — treating as global"];
      }
      if (requesterCaste === ref.ownerCaste) {
        return [true, "caste match"];
      }
      return [
        false,
        `caste mismatch: requester=${requesterCaste}, owner=${ref.ownerCaste}`,
      ];
    }
    if (ref.scope === SecretScope.AGENT) {
      if (!ref.ownerAgentId) {
        return [false, "agent scope with no owner — denied"];
      }
      if (requesterAgentId === ref.ownerAgentId) {
        return [true, "agent match"];
      }
      return [
        false,
        `agent mismatch: requester=${requesterAgentId}, owner=${ref.ownerAgentId}`,
      ];
    }
    return [false, `unknown scope: ${ref.scope}`];
  }

  private logAccess(
    name: string,
    requesterCaste: string,
    requesterAgentId: string,
    outcome: "allowed" | "denied",
    reason = "",
  ): void {
    const entry: AccessLogEntry = {
      timestamp: new Date().toISOString(),
      secretName: name,
      requesterCaste,
      requesterAgentId,
      outcome,
      reason,
    };
    this.accessLog.push(entry);

    if (this.config.enableAuditLogging) {
      console.log(
        `[vault] Secret access: name=${name}, caste=${requesterCaste}, agent=${requesterAgentId}, outcome=${outcome}, reason=${reason}`,
      );
    }
  }

  // -- Operations ---------------------------------------------------------

  async getSecret(
    name: string,
    requesterCaste: string,
    requesterAgentId: string,
  ): Promise<string | null> {
    const ref = this.refs.get(name);
    if (!ref) {
      this.logAccess(
        name,
        requesterCaste,
        requesterAgentId,
        "denied",
        "secret not registered",
      );
      throw new VaultError(`Secret not registered: ${name}`);
    }

    const [allowed, reason] = this.checkAccess(
      ref,
      requesterCaste,
      requesterAgentId,
    );
    if (!allowed) {
      this.logAccess(
        name,
        requesterCaste,
        requesterAgentId,
        "denied",
        reason,
      );
      throw new VaultError(`Access denied for secret '${name}': ${reason}`);
    }

    const value = await this.backend.get(name);
    this.logAccess(
      name,
      requesterCaste,
      requesterAgentId,
      "allowed",
      reason,
    );
    return value;
  }

  async storeSecret(ref: SecretRef, value: string): Promise<void> {
    const encoded = Buffer.from(value, "utf-8");
    if (encoded.length > this.config.maxSecretSizeBytes) {
      throw new VaultError(
        `Secret '${ref.name}' exceeds max size (${encoded.length} > ${this.config.maxSecretSizeBytes})`,
      );
    }
    this.registerSecret(ref);
    await this.backend.set(ref.name, value);
    console.log(`[vault] Stored secret: ${ref.name}`);
  }

  async rotateSecret(name: string, newValue: string): Promise<void> {
    const ref = this.refs.get(name);
    if (!ref) {
      throw new VaultError(`Cannot rotate unregistered secret: ${name}`);
    }
    await this.backend.set(name, newValue);
    ref.rotatedAt = new Date().toISOString();
    console.log(`[vault] Rotated secret: ${name}`);
  }

  async revokeSecret(name: string): Promise<void> {
    await this.backend.delete(name);
    this.refs.delete(name);
    console.log(`[vault] Revoked secret: ${name}`);
  }

  async listSecrets(requesterCaste: string): Promise<SecretRef[]> {
    const visible: SecretRef[] = [];
    for (const ref of this.refs.values()) {
      if (ref.scope === SecretScope.GLOBAL) {
        visible.push(ref);
      } else if (ref.scope === SecretScope.CASTE) {
        if (!ref.ownerCaste || ref.ownerCaste === requesterCaste) {
          visible.push(ref);
        }
      } else if (ref.scope === SecretScope.AGENT) {
        if (ref.ownerCaste === requesterCaste) {
          visible.push(ref);
        }
      }
    }
    return visible;
  }

  getAccessLog(): AccessLogEntry[] {
    return [...this.accessLog];
  }

  clearAccessLog(): void {
    this.accessLog.length = 0;
  }
}
