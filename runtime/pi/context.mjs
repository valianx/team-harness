import { resolveContextBinding, selectWorkspacePreference } from '../../skills/workspace/scripts/workspace-context.mjs';

/** Resolve retained context first; this host has no implicit Space transport or credential bridge. */
export function inspectPiWorkspace(settings, entries = []) {
  const retained = entries.findLast(entry => entry.type === 'custom' && entry.customType === 'th-workspace-binding')?.data;
  const boundContext = retained?.binding ?? retained ?? null;
  const preference = selectWorkspacePreference(settings);
  const resolved = resolveContextBinding({ boundContext, preference });
  const remote = boundContext?.context?.kind === 'gpt-space' || (!boundContext && preference.mode === 'gpt-space');
  return { ...resolved, preference, ...(remote ? { operations: {
    read: { status: 'unavailable', operation: 'read', reason_code: 'native_space_read_unavailable' },
    write: { status: 'unavailable', operation: 'write', reason_code: 'native_space_write_unavailable' },
  } } : {}) };
}
