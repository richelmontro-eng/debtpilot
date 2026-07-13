import { describe, expect, it } from 'vitest';
import { saveOnboardingBills, type BillSaveError, type BillStore, type OnboardingBill } from './onboarding-bills';

const bill = (overrides: Partial<OnboardingBill> = {}): OnboardingBill => ({ id: '11111111-1111-4111-8111-111111111111', name: 'Electric Bill', amount: 120, dueDay: 15, frequency: 'monthly', ...overrides });

function memoryStore(options: { failId?: string; error?: BillSaveError; initial?: OnboardingBill[] } = {}) {
  const rows = new Map((options.initial ?? []).map(item => [item.id, item]));
  const store: BillStore = {
    async upsert(item) {
      if (item.id === options.failId) return { error: options.error ?? { code: '42501', message: 'denied' } };
      rows.set(item.id, item);
      return { error: null };
    },
    async listIds() { return { ids: [...rows.keys()], error: null }; },
    async remove(ids) { ids.forEach(id => rows.delete(id)); return { error: null }; },
  };
  return { store, rows };
}

describe('reliable onboarding bill saves', () => {
  it('saves a valid bill successfully', async () => {
    const { store, rows } = memoryStore();
    expect((await saveOnboardingBills(store, [bill()])).ok).toBe(true);
    expect(rows.get(bill().id)?.name).toBe('Electric Bill');
  });

  it('identifies a missing due date before saving', async () => {
    const { store, rows } = memoryStore();
    const result = await saveOnboardingBills(store, [bill({ dueDay: 0 })]);
    expect(result.message).toBe("We couldn't save Electric Bill because its due date is missing or invalid.");
    expect(rows.size).toBe(0);
  });

  it('rejects an invalid amount', async () => {
    const result = await saveOnboardingBills(memoryStore().store, [bill({ amount: 0 })]);
    expect(result.message).toContain('amount greater than $0');
  });

  it('returns a safe bill-specific message for an RLS failure', async () => {
    const result = await saveOnboardingBills(memoryStore({ failId: bill().id, error: { code: '42501', message: 'row-level security policy', details: 'private details', hint: 'private hint' } }).store, [bill()]);
    expect(result.message).toBe('Electric Bill could not be saved. Please try again.');
    expect(result.message).not.toMatch(/security|policy|private/i);
  });

  it('reports which row failed after a partial multi-bill save', async () => {
    const water = bill({ id: '22222222-2222-4222-8222-222222222222', name: 'Water Bill' });
    const { store, rows } = memoryStore({ failId: water.id });
    const result = await saveOnboardingBills(store, [bill(), water]);
    expect(result.savedIds).toEqual([bill().id]);
    expect(result.failedBill?.name).toBe('Water Bill');
    expect(rows.size).toBe(1);
  });

  it('retries with stable upsert IDs without duplicates', async () => {
    const { store, rows } = memoryStore();
    await saveOnboardingBills(store, [bill()]);
    await saveOnboardingBills(store, [bill({ amount: 140 })]);
    expect(rows.size).toBe(1);
    expect(rows.get(bill().id)?.amount).toBe(140);
  });
});
