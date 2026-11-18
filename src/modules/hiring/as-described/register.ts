// Host page slot. Null until the org has enough answers to show.
import { registerHostPageProvider } from '@/modules/hostpages';
import { getAsDescribedSummary } from './summary';

export function registerAsDescribedProvider(): void {
  try {
    registerHostPageProvider({
      kind: 'as_described',
      fn: async (db, orgId) => {
        const summary = await getAsDescribedSummary(db, { orgId });
        if (!summary.visible) return null;
        return {
          responses: summary.responses,
          housing: summary.housing,
          meals: summary.meals,
          pay: summary.pay,
        };
      },
    });
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    // A second import is normal. A test that replaces hostpages with a partial fake
    // has no slot to fill; production always exports the registrar.
    if (err.message.includes('already registered')) return;
    if (err.message.includes('No "registerHostPageProvider"')) return;
    throw err;
  }
}

registerAsDescribedProvider();
