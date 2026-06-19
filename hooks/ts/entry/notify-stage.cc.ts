// hooks/ts/entry/notify-stage.cc.ts
// STUB — notify-stage is NOT a CC hook event.
// notify-stage.sh is orchestrator-invoked (piped JSON from the orchestrator at stage boundaries).
// The CC entry is a no-op stub for completeness; the actual work is done by notify-stage.sh
// (which calls notify-{windows,mac,linux}.sh per the OS detection).
//
// This file exists so the adapter descriptor can reference an emit path and so
// the opencode plugin module does NOT register notify-stage as a tool:before hook.
//
// If you are looking for the TS body logic: see hooks/ts/bodies/notify-stage.ts.
// If you are looking for the runtime executable: hooks/notify-stage.sh (Bash).

export {};
