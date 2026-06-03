export function parseVersion(output: string): string | null {
  const m = output.match(/Trustabl\s+(\S+)/i);
  return m ? m[1] : null;
}

// v1 pins one exact CLI version (the JSON contract it was built against).
// Range support can come later if the contract proves stable across versions.
export function satisfiesPin(have: string, pinned: string): boolean {
  return have.replace(/^v/, '') === pinned.replace(/^v/, '');
}
