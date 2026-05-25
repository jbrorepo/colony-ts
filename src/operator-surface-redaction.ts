import { scrubSecrets } from "./security/log-sanitizer";

export function redactOperatorSurfaceText(value: string): string {
  return scrubSecrets(value)
    .replace(/\bsk-ant-\*+/g, "[REDACTED_SECRET]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
}

export function redactOperatorSurfaceList(
  values: string[] | undefined,
  separator: string,
  fallback = "none",
): string {
  return values && values.length > 0
    ? values.map(redactOperatorSurfaceText).join(separator)
    : fallback;
}
