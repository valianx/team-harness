declare module "*workspace-preference.mjs" {
  /** Select workspace preference without changing configuration or accessing a provider. */
  export function selectWorkspacePreference(config: Record<string, unknown>): {
    status: "selected" | "invalid";
    mode: "local" | "obsidian" | "gpt-space" | null;
    conflict: boolean;
  };
}
