// W0 stub. The owning workstream replaces the body and keeps the name.
export async function pass(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: pass (W1)');
}

export async function undoPass(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: undoPass (W1)');
}

export async function commitPass(..._args: unknown[]): Promise<void> {}
