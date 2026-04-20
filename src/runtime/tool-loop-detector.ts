/**
 * Tool Loop Detection & Mutation Tracking.
 *
 * 1:1 port of colony/runtime/tool_loop_detector.py — detects when an agent
 * enters repetitive tool call patterns and injects system guidance to break
 * the loop.
 *
 * Design:
 *   - Sliding window of recent tool calls (name + normalized args hash)
 *   - Caste-specific thresholds
 *   - Mutation tracking: detects oscillation (edit A → edit B → edit A)
 *   - System message injection when loop is detected
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Caste-specific thresholds
// ---------------------------------------------------------------------------

const CASTE_LOOP_THRESHOLDS: Record<string, number> = {
  ROOT_QUEEN: 5,
  QUEEN_CORE: 5,
  CORE_SHAPERS: 4,
  FORGE_CARVERS: 4,     // Edits can legitimately repeat
  LORE_BURROW: 3,       // Research loops are common
  ASSIST_ANT: 3,
  WATCHER_SWARM: 3,
  SHIELD_GENERALS: 4,
  NAMELESS_SWARM: 2,    // Red-team agents should never loop
};

const DEFAULT_LOOP_THRESHOLD = 3;
const DEFAULT_WINDOW_SIZE = 20;
const MUTATION_OSCILLATION_WINDOW = 6;

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

export interface ToolCallFingerprint {
  toolName: string;
  argsHash: string;
  timestamp: number;
}

function createFingerprint(
  toolName: string,
  args?: Record<string, unknown>,
): ToolCallFingerprint {
  let argsStr = "";
  if (args) {
    // Normalize: sort keys, remove volatile fields
    const stable: Record<string, unknown> = {};
    for (const key of Object.keys(args).sort()) {
      if (!["timestamp", "request_id", "trace_id"].includes(key)) {
        stable[key] = args[key];
      }
    }
    argsStr = JSON.stringify(stable);
  }
  const argsHash = createHash("md5")
    .update(argsStr)
    .digest("hex")
    .slice(0, 12);

  return { toolName, argsHash, timestamp: Date.now() / 1000 };
}

// ---------------------------------------------------------------------------
// Mutation tracking
// ---------------------------------------------------------------------------

export interface MutationEntry {
  path: string;
  operation: string; // "write", "edit", "replace"
  contentHash: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

export interface LoopDetectionResult {
  isLooping: boolean;
  pattern: string;
  repeatCount: number;
  toolName: string;
  isOscillating: boolean;
  oscillationPath: string;
}

function noLoop(): LoopDetectionResult {
  return {
    isLooping: false,
    pattern: "",
    repeatCount: 0,
    toolName: "",
    isOscillating: false,
    oscillationPath: "",
  };
}

// ---------------------------------------------------------------------------
// ToolLoopDetector
// ---------------------------------------------------------------------------

export class ToolLoopDetector {
  private _caste: string;
  private _threshold: number;
  private _windowSize: number;
  private _window: ToolCallFingerprint[] = [];
  private _mutations: MutationEntry[] = [];
  private _loopCount = 0;
  private _lastDetection: LoopDetectionResult | null = null;

  constructor(opts?: {
    caste?: string;
    threshold?: number;
    windowSize?: number;
  }) {
    this._caste = opts?.caste ?? "";
    this._threshold =
      opts?.threshold || CASTE_LOOP_THRESHOLDS[this._caste] || DEFAULT_LOOP_THRESHOLD;
    this._windowSize = opts?.windowSize ?? DEFAULT_WINDOW_SIZE;
  }

  get threshold(): number {
    return this._threshold;
  }

  get isLooping(): boolean {
    return this._lastDetection !== null && this._lastDetection.isLooping;
  }

  get loopCount(): number {
    return this._loopCount;
  }

  get lastDetection(): LoopDetectionResult | null {
    return this._lastDetection;
  }

  record(
    toolName: string,
    args?: Record<string, unknown>,
  ): LoopDetectionResult {
    const fp = createFingerprint(toolName, args);
    this._window.push(fp);

    // Enforce sliding window
    if (this._window.length > this._windowSize) {
      this._window.shift();
    }

    const result = this._checkLoop();
    this._lastDetection = result;

    if (result.isLooping) {
      this._loopCount++;
    }

    return result;
  }

  recordMutation(
    path: string,
    operation: string,
    content = "",
  ): LoopDetectionResult {
    const contentHash = createHash("md5")
      .update(content)
      .digest("hex")
      .slice(0, 16);

    this._mutations.push({
      path,
      operation,
      contentHash,
      timestamp: Date.now() / 1000,
    });

    // Enforce max mutations tracked
    const maxMutations = MUTATION_OSCILLATION_WINDOW * 2;
    if (this._mutations.length > maxMutations) {
      this._mutations = this._mutations.slice(-maxMutations);
    }

    const result = this._checkOscillation(path);
    if (result.isOscillating) {
      this._loopCount++;
      this._lastDetection = result;
    }

    return result;
  }

  getGuidanceMessage(): string {
    if (!this._lastDetection || !this._lastDetection.isLooping) return "";

    const det = this._lastDetection;

    if (det.isOscillating) {
      return (
        `⚠️ Loop Alert: You are oscillating on file '${det.oscillationPath}' ` +
        `— editing it back and forth between two states. ` +
        `Stop, re-read the file, and make a single deliberate edit. ` +
        `If you're stuck, explain the issue to the user.`
      );
    }

    return (
      `⚠️ Loop Alert: You have called '${det.toolName}' with the same ` +
      `arguments ${det.repeatCount} times. This suggests you're stuck. ` +
      `Consider: (1) Try a different approach. (2) Read the error more ` +
      `carefully. (3) Ask the user for clarification. ` +
      `Pattern: ${det.pattern}`
    );
  }

  reset(): void {
    this._window = [];
    this._mutations = [];
    this._loopCount = 0;
    this._lastDetection = null;
  }

  private _checkLoop(): LoopDetectionResult {
    if (this._window.length < this._threshold) return noLoop();

    const recent = this._window;
    const last = recent[recent.length - 1];

    // Count exact matches (same tool + same args hash)
    let exactMatches = 0;
    for (const fp of recent) {
      if (fp.toolName === last.toolName && fp.argsHash === last.argsHash) {
        exactMatches++;
      }
    }

    if (exactMatches >= this._threshold) {
      return {
        isLooping: true,
        pattern: `${last.toolName}(${last.argsHash}) × ${exactMatches}`,
        repeatCount: exactMatches,
        toolName: last.toolName,
        isOscillating: false,
        oscillationPath: "",
      };
    }

    // Check for tool-name-only loops (same tool, different args)
    const tail = recent.slice(-this._threshold);
    const toolMatches = tail.filter((fp) => fp.toolName === last.toolName).length;
    const loopableTools = new Set([
      "file_read", "grep", "search", "bash", "shell",
    ]);

    if (toolMatches >= this._threshold && loopableTools.has(last.toolName)) {
      return {
        isLooping: true,
        pattern: `${last.toolName}(varied args) × ${toolMatches}`,
        repeatCount: toolMatches,
        toolName: last.toolName,
        isOscillating: false,
        oscillationPath: "",
      };
    }

    return noLoop();
  }

  private _checkOscillation(path: string): LoopDetectionResult {
    const pathMutations = this._mutations.filter((m) => m.path === path);

    if (pathMutations.length < 3) return noLoop();

    // Check last N mutations for ABAB pattern
    const recent = pathMutations.slice(-MUTATION_OSCILLATION_WINDOW);
    const hashes = recent.map((m) => m.contentHash);

    const unique = new Set(hashes);
    if (unique.size === 2 && hashes.length >= 4) {
      // Check if they alternate
      const alternating = hashes.every(
        (h, i) => i === 0 || h !== hashes[i - 1],
      );
      if (alternating) {
        return {
          isLooping: true,
          isOscillating: true,
          oscillationPath: path,
          pattern: `Oscillation on ${path}: ${hashes.slice(0, 4).join(" → ")}`,
          repeatCount: hashes.length,
          toolName: "file_edit",
        };
      }
    }

    return noLoop();
  }
}
