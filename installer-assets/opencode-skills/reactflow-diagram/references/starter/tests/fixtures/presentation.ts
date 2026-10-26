import type { Measurements } from '../../src/types';

/** Unscaled Inter DOM measurements of the shipped sample at 1280×720. */
export function samplePresentationMeasurements(): Measurements {
  return {
    nodes: {
      gateway: { width: 224, height: 76 }, orchestrator: { width: 224, height: 83 },
      database: { width: 224, height: 76 }, events: { width: 224, height: 83 }, provider: { width: 224, height: 83 },
    },
    headers: { payments: { width: 224, height: 22.5 }, processing: { width: 224, height: 22.5 } },
    labels: {
      request: { width: 64, height: 30.890625 }, persistence: { width: 46, height: 30.890625 },
      publish: { width: 106, height: 30.890625 }, notification: { width: 93, height: 30.890625 },
    },
  };
}
