// hooks/ts/bodies/hook-profile.ts
// TS port of hooks/_hook-profile.sh — TH_HOOK_PROFILE resolver.
// ONLY imported by observability/notification bodies.
// ENFORCEMENT FLOORS MUST NEVER import this module.
//
// Provides:
//   getHookProfile()         — returns normalized profile: minimal | standard | strict.
//   observabilityEnabled(class) — returns true (enabled) or false (suppressed).
//
// Decision matrix:
//   Profile   | idle-notify | pipeline-observability
//   ----------|-------------|------------------------
//   minimal   | suppressed  | suppressed
//   standard  | enabled     | enabled      (default)
//   strict    | enabled     | enabled
//
// Fail-safe: TH_HOOK_PROFILE unset/unrecognized → "standard" (observability on).

export type HookProfile = "minimal" | "standard" | "strict";
export type ObservabilityClass = "idle-notify" | "pipeline-observability";

export function getHookProfile(): HookProfile {
  // Access TH_HOOK_PROFILE from the environment.
  // In Node/Bun, process.env is available.
  const val = (
    typeof process !== "undefined" ? process.env["TH_HOOK_PROFILE"] : undefined
  ) ?? "";
  if (val === "minimal" || val === "standard" || val === "strict") {
    return val;
  }
  // Unset, empty, or unrecognized → default: standard.
  return "standard";
}

export function observabilityEnabled(cls: ObservabilityClass): boolean {
  const profile = getHookProfile();
  if (profile === "minimal") {
    // Both classes suppressed under minimal.
    if (cls === "idle-notify" || cls === "pipeline-observability") {
      return false;
    }
    // Unknown class → fail-safe: enabled.
    return true;
  }
  // standard and strict: both classes enabled.
  return true;
}
