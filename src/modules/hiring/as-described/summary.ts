// W0 stub. The owning workstream replaces the body and keeps the name.
export async function getAsDescribedSummary(..._args: unknown[]) {
  const tally = { yes: 0, partly: 0, no: 0 };
  return { responses: 0, visible: false, housing: tally, meals: tally, pay: tally };
}
