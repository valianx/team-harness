import { layout } from './layout';
import { checkGeometry } from './geometry';
import { TOKENS } from './tokens';
import type { Architecture, Geometry, Measurements } from './types';

const normalized = (measurements: Measurements) => JSON.stringify(Object.fromEntries(Object.entries(measurements).map(([kind, values]) => [kind,
  Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([id, size]) => [id,
    { width: Math.round(size.width / TOKENS.tolerance), height: Math.round(size.height / TOKENS.tolerance) }]))])));

/** Run bounded measurement/layout generations, rejecting every stale completion. */
export function createLayoutRunner(options: { layout?: (model: Architecture, sizes: Measurements) => Promise<Geometry>; timeoutMs?: number; maxPasses?: number } = {}) {
  let generation = 0;
  return {
    invalidate() { generation++; },
    async run(model: Architecture, measure: () => Promise<Measurements>) {
      const current = ++generation;
      let timer: ReturnType<typeof setTimeout>;
      const assertCurrent = () => { if (current !== generation) throw new Error('Stale layout generation was discarded'); };
      const work = async () => {
        if (!model.nodes.length && !model.groups.length) return { geometry: { nodes: [], edges: [], bounds: { width: 0, height: 0 } }, diagnostics: [] };
        let sizes = structuredClone(await measure()); assertCurrent();
        for (let pass = 0; pass < (options.maxPasses ?? TOKENS.maxPasses); pass++) {
          const geometry = await (options.layout ?? layout)(model, sizes); assertCurrent();
          const next = structuredClone(await measure()); assertCurrent();
          if (normalized(sizes) === normalized(next)) return { geometry, diagnostics: checkGeometry(model, geometry) };
          sizes = next;
        }
        throw new Error('Measurement did not converge within the layout pass limit');
      };
      try {
        return await Promise.race([work(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => { if (current === generation) generation++; reject(new Error('Measurement/layout readiness timeout')); }, options.timeoutMs ?? TOKENS.timeoutMs);
        })]);
      } finally { clearTimeout(timer!); }
    },
  };
}
