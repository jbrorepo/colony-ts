/**
 * Heap Protection — prevent ptrace / core-dump extraction of API keys.
 *
 * 1:1 port of colony/security/heap_protection.py (V15).
 *
 * On Linux, calls prctl(PR_SET_DUMPABLE, 0) via Bun FFI to prevent
 * same-UID processes (gdb, strace) from attaching and reading tokens
 * or encryption keys from the heap.
 *
 * On non-Linux platforms the call is a silent no-op.
 */

let _protected = false;

/**
 * Disable core dumps and ptrace for the current process.
 *
 * On Linux, uses dlopen to call prctl(PR_SET_DUMPABLE, 0).
 * On non-Linux platforms this is a silent no-op.
 *
 * @returns true if protection was successfully applied.
 */
export function enableHeapProtection(): boolean {
  if (process.platform !== "linux") {
    console.debug(
      `[heap_protection] skipped (platform=${process.platform}, not linux)`,
    );
    return false;
  }

  try {
    // PR_SET_DUMPABLE = 4  (from <sys/prctl.h>)
    // On Bun, we can try using FFI. On Node, we attempt a
    // child_process fallback. The actual prctl call requires
    // native binding — we degrade gracefully if unavailable.

    // Attempt 1: Bun FFI (if available)
    if (typeof globalThis.Bun !== "undefined") {
      try {
        const { dlopen, FFIType, suffix } = (globalThis as any).Bun;
        const lib = dlopen(`libc.so.6`, {
          prctl: {
            args: [FFIType.i32, FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64],
            returns: FFIType.i32,
          },
        });
        const rc = lib.symbols.prctl(4, 0, 0, 0, 0);
        if (rc === 0) {
          _protected = true;
          console.log(
            "[heap_protection] PR_SET_DUMPABLE=0 applied — ptrace/core-dump blocked",
          );
          return true;
        }
        console.warn(`[heap_protection] prctl returned ${rc}`);
        return false;
      } catch (err) {
        console.debug(`[heap_protection] Bun FFI failed: ${err}`);
      }
    }

    // Attempt 2: Fallback — cannot call prctl without native bindings
    console.debug(
      "[heap_protection] No FFI available — heap protection not applied",
    );
    return false;
  } catch (err) {
    console.debug(`[heap_protection] unexpected error: ${err}`);
    return false;
  }
}

/** Return whether heap protection is currently active. */
export function isHeapProtected(): boolean {
  return _protected;
}
