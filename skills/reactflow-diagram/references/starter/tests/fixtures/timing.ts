import type { Geometry } from '../../src/types';

/** Compare deterministic geometry and work while retaining elapsed observations in production evidence. */
export function withoutTiming(geometry: Geometry): Geometry {
  const copy = structuredClone(geometry);
  if (copy.composition) {
    copy.composition.execution.elapsedMs = 0;
    copy.composition.candidates.forEach(candidate => { candidate.elapsedMs = 0; });
  }
  return copy;
}
