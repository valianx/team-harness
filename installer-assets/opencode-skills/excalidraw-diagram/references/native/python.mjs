import { spawnSync } from 'node:child_process';

export function findPython(preferred = process.env.TH_NATIVE_PYTHON) {
  const candidates = preferred ? [[preferred, []]]
    : process.platform === 'win32' ? [['py', ['-3']], ['python', []], ['python3', []]]
      : [['python3', []], ['python', []], ['py', ['-3']]];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.executable); print(sys.version_info.major)'], { encoding: 'utf8' });
    const lines = result.stdout?.trim().split(/\r?\n/);
    if (result.status === 0 && lines.at(-1) === '3') return { command, prefix, executable: lines[0] };
  }
  throw new Error('Python 3 unavailable; set TH_NATIVE_PYTHON to its executable path');
}
