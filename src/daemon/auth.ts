export type DaemonAuthScope =
  | "daemon.describe"
  | "sessions.read"
  | "sessions.write"
  | "workflow.read"
  | "workflow.write"
  | "web.read"
  | "web.mutate";

export interface DaemonAuthTokenConfig {
  token: string;
  label?: string;
  scopes: DaemonAuthScope[];
  expiresAt?: string;
}

export interface DaemonAuthPolicyOptions {
  tokens: DaemonAuthTokenConfig[];
}

export interface DaemonAuthTokenStatus {
  label: string;
  scopes: DaemonAuthScope[];
  expiresAt?: string;
  expired: boolean;
}

export interface DaemonAuthStatus {
  required: boolean;
  tokenCount: number;
  tokens: DaemonAuthTokenStatus[];
}

export interface DaemonAuthGrant {
  label: string;
  scopes: DaemonAuthScope[];
}

export interface DaemonAuthDecision {
  ok: boolean;
  grant?: DaemonAuthGrant;
  code?: "missing_token" | "invalid_token" | "expired_token" | "insufficient_scope";
  message?: string;
  requiredScope?: DaemonAuthScope;
}

interface NormalizedDaemonAuthToken {
  token: string;
  label: string;
  scopes: DaemonAuthScope[];
  expiresAt?: string;
}

const textEncoder = new TextEncoder();

export class DaemonAuthPolicy {
  private readonly _tokens: NormalizedDaemonAuthToken[];

  constructor(options: DaemonAuthPolicyOptions) {
    this._tokens = options.tokens.map((token, index) => {
      if (!token.token.trim()) throw new Error("Daemon auth token cannot be empty");
      if (token.scopes.length === 0) throw new Error("Daemon auth token requires at least one scope");
      return {
        token: token.token,
        label: token.label?.trim() || `token-${index + 1}`,
        scopes: uniqueScopes(token.scopes),
        expiresAt: token.expiresAt,
      };
    });
  }

  authorize(rawToken: string | null, requiredScope?: DaemonAuthScope): DaemonAuthDecision {
    if (!rawToken) {
      return {
        ok: false,
        code: "missing_token",
        message: "Missing bearer token",
        requiredScope,
      };
    }

    const token = this._tokens.find((candidate) => constantTimeEqual(candidate.token, rawToken));
    if (!token) {
      return {
        ok: false,
        code: "invalid_token",
        message: "Invalid bearer token",
        requiredScope,
      };
    }

    if (isExpired(token.expiresAt)) {
      return {
        ok: false,
        code: "expired_token",
        message: "Expired bearer token",
        requiredScope,
      };
    }

    if (requiredScope && !token.scopes.includes(requiredScope)) {
      return {
        ok: false,
        code: "insufficient_scope",
        message: `Bearer token lacks required scope: ${requiredScope}`,
        requiredScope,
      };
    }

    return {
      ok: true,
      grant: {
        label: token.label,
        scopes: [...token.scopes],
      },
    };
  }

  status(): DaemonAuthStatus {
    return {
      required: true,
      tokenCount: this._tokens.length,
      tokens: this._tokens.map((token) => ({
        label: token.label,
        scopes: [...token.scopes],
        expiresAt: token.expiresAt,
        expired: isExpired(token.expiresAt),
      })),
    };
  }
}

export function extractBearerToken(request: Request): string | null {
  const rawHeader = request.headers.get("authorization");
  if (!rawHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(rawHeader.trim());
  return match?.[1] ?? null;
}

function uniqueScopes(scopes: DaemonAuthScope[]): DaemonAuthScope[] {
  return [...new Set(scopes)].sort();
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index++) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}
