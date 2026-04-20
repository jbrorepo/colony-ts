/**
 * Deferred MemPalace compressor.
 *
 * Real memory compression will be implemented with the MemPalace milestone.
 * This placeholder prevents lossy aliasing from entering prompts prematurely.
 */

export class DeferredMemPalaceCompressorError extends Error {
  constructor() {
    super("MemPalace compression is deferred until the memory subsystem milestone.");
    this.name = "DeferredMemPalaceCompressorError";
  }
}

export class AAAKCompressor {
  compress(_rawText: string): string {
    throw new DeferredMemPalaceCompressorError();
  }

  decompress(_compressedText: string): string {
    throw new DeferredMemPalaceCompressorError();
  }

  getMappingTable(): Record<string, string> {
    return {};
  }
}

export const MEMPALACE_COMPRESSOR_DEFERRED = true;
