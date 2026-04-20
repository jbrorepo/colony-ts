/**
 * The Colony - Entry Point
 *
 * Install secret scrubbing before the UI/runtime import graph is loaded so
 * startup logs cannot leak credentials. The UI module is loaded afterwards.
 */

import { installLogSanitizer } from "./security/log-sanitizer";

installLogSanitizer();

const { startColonyUI } = await import("./ui/app");

startColonyUI();
