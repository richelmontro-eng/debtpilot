import { describe, expect, it } from 'vitest';
import { debtPayload, mapDebtRow, saveDebts, type DebtStore, type PersistedDebt } from './debt-persistence';

const base: PersistedDebt = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Promo card', balance: 1200, apr: 29.99, minimum: 50, promotionType: 'deferred_interest', promotionalApr: 0, promotionEndDate: '2027-01-01', postPromotionApr: 29.99, originalPromotionalBalance: 1500, estimatedDeferredInterest: 300 };

function memoryStore(initial: Record<string, unknown>[] = []) {
  let rows = [...initial];
  const store: DebtStore = {
    async upsert(payload) { const index = rows.findIndex(row => row.id === payload.id); if (index >= 0) rows[index] = payload; else rows.push(payload); return { error: null }; },
    async reload() { return { rows: [...rows], error: null }; },
    async remove(ids) { rows = rows.filter(row => !ids.includes(String(row.id))); return { error: null }; },
  };
  return { store, rows: () => rows };
}

describe('promotional debt persistence', () => {
  it.each(['deferred_interest', 'zero_percent'] as const)('saves and reloads %s promotions', async promotionType => {
    const memory = memoryStore();
    const debt = { ...base, promotionType };
    const result = await saveDebts(memory.store, 'user-1', [debt]);
    expect(result.ok).toBe(true);
    expect(result.debts[0]).toMatchObject(debt);
  });
  it('edits without inserting a duplicate and retries idempotently', async () => {
    const memory = memoryStore([debtPayload('user-1', base)]);
    await saveDebts(memory.store, 'user-1', [{ ...base, postPromotionApr: 31 }]);
    await saveDebts(memory.store, 'user-1', [{ ...base, postPromotionApr: 31 }]);
    expect(memory.rows()).toHaveLength(1);
    expect(memory.rows()[0].post_promotion_apr).toBe(31);
  });
  it('clears every promotional value when promotion type is none', () => {
    expect(debtPayload('user-1', { ...base, promotionType: 'none' })).toMatchObject({ promotion_type: 'none', promotional_apr: null, promotion_end_date: null, post_promotion_apr: null, original_promotional_balance: null, estimated_deferred_interest: null });
  });
  it('keeps blank optional values as null', () => {
    const payload = debtPayload('user-1', { ...base, promotionalApr: null, promotionEndDate: '', postPromotionApr: null, originalPromotionalBalance: null, estimatedDeferredInterest: null });
    expect(payload).toMatchObject({ promotional_apr: null, promotion_end_date: null, post_promotion_apr: null, original_promotional_balance: null, estimated_deferred_interest: null });
    expect(mapDebtRow(payload)).toMatchObject({ promotionalApr: null, promotionEndDate: '', postPromotionApr: null });
  });
  it('uses the same idempotent persistence flow for onboarding debts', async () => {
    const memory = memoryStore();
    const first = await saveDebts(memory.store, 'user-1', [base]);
    const resumed = await saveDebts(memory.store, 'user-1', first.debts);
    expect(resumed.debts).toHaveLength(1);
    expect(resumed.debts[0].estimatedDeferredInterest).toBe(300);
  });
  it('identifies promotional metadata failures and preserves entered values', async () => {
    const existing = debtPayload('user-1', { ...base, promotionType: 'none' });
    const memory = memoryStore([existing]);
    memory.store.upsert = async () => ({ error: { code: 'PGRST204', message: "Could not find the 'promotion_type' column" } });
    const result = await saveDebts(memory.store, 'user-1', [base]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Promo card's base debt is still available");
    expect(result.debts[0]).toEqual(base);
  });
});
