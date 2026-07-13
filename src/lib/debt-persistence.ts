export type PromotionType = 'none' | 'zero_percent' | 'deferred_interest';

export type PersistedDebt = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimum: number;
  promotionType: PromotionType;
  promotionalApr: number | null;
  promotionEndDate: string;
  postPromotionApr: number | null;
  originalPromotionalBalance: number | null;
  estimatedDeferredInterest: number | null;
};

export type DebtSaveError = { code?: string; message?: string; details?: string; hint?: string };
export type DebtStore = {
  upsert: (payload: Record<string, unknown>) => Promise<{ error: DebtSaveError | null }>;
  reload: () => Promise<{ rows: Record<string, unknown>[]; error: DebtSaveError | null }>;
  remove: (ids: string[]) => Promise<{ error: DebtSaveError | null }>;
};
export type DebtSaveResult = { ok: boolean; debts: PersistedDebt[]; message: string; warning?: string; error?: DebtSaveError; failedDebt?: PersistedDebt };

const promotionColumns = /promotion_type|promotional_apr|promotion_end_date|post_promotion_apr|original_promotional_balance|estimated_deferred_interest/i;

export function optionalNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

export function normalizePromotion(debt: PersistedDebt) {
  if (debt.promotionType === 'none') return {
    promotion_type: 'none', promotional_apr: null, promotion_end_date: null,
    post_promotion_apr: null, original_promotional_balance: null, estimated_deferred_interest: null,
  };
  return {
    promotion_type: debt.promotionType,
    promotional_apr: optionalNumber(debt.promotionalApr),
    promotion_end_date: debt.promotionEndDate.trim() || null,
    post_promotion_apr: optionalNumber(debt.postPromotionApr),
    original_promotional_balance: optionalNumber(debt.originalPromotionalBalance),
    estimated_deferred_interest: optionalNumber(debt.estimatedDeferredInterest),
  };
}

export function debtPayload(userId: string, debt: PersistedDebt) {
  return { id: debt.id, user_id: userId, name: debt.name.trim(), balance: Math.max(0, debt.balance), apr: Math.max(0, debt.apr), minimum_payment: Math.max(0, debt.minimum), ...normalizePromotion(debt) };
}

export function mapDebtRow(row: Record<string, unknown>): PersistedDebt {
  const type = row.promotion_type === 'zero_percent' || row.promotion_type === 'deferred_interest' ? row.promotion_type : 'none';
  return {
    id: String(row.id), name: String(row.name ?? ''), balance: Number(row.balance ?? 0), apr: Number(row.apr ?? 0), minimum: Number(row.minimum_payment ?? 0),
    promotionType: type, promotionalApr: optionalNumber(row.promotional_apr), promotionEndDate: typeof row.promotion_end_date === 'string' ? row.promotion_end_date : '',
    postPromotionApr: optionalNumber(row.post_promotion_apr), originalPromotionalBalance: optionalNumber(row.original_promotional_balance), estimatedDeferredInterest: optionalNumber(row.estimated_deferred_interest),
  };
}

export function logDebtSaveError(context: string, error: DebtSaveError, debt?: PersistedDebt) {
  if (process.env.NODE_ENV === 'production') return;
  console.error('[DebtPilot debt save]', { context, debtId: debt?.id, debtName: debt?.name, code: error.code, message: error.message, details: error.details, hint: error.hint });
}

function promotionalSchemaError(error: DebtSaveError) {
  return promotionColumns.test(`${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`) || (error.code === 'PGRST204' && promotionColumns.test(error.message ?? ''));
}

export async function saveDebts(store: DebtStore, userId: string, debts: PersistedDebt[]): Promise<DebtSaveResult> {
  const before = await store.reload();
  if (before.error) { logDebtSaveError('load debts before save', before.error); return { ok: false, debts, message: 'Debts could not be loaded for saving. Please try again.', error: before.error }; }
  const existingIds = new Set(before.rows.map(row => String(row.id)));
  const savedIds: string[] = [];
  for (const debt of debts) {
    const result = await store.upsert(debtPayload(userId, debt));
    if (result.error) {
      logDebtSaveError('upsert debt', result.error, debt);
      const name = debt.name.trim() || 'This debt';
      const message = promotionalSchemaError(result.error) && existingIds.has(debt.id)
        ? `${name}'s base debt is still available, but its promotional details were not saved. Your entries are preserved so you can try again.`
        : promotionalSchemaError(result.error)
          ? `${name} could not be saved because promotional debt support is not available yet. Your entries are preserved so you can try again.`
          : `${name} could not be saved. Your entries are preserved so you can try again.`;
      return { ok: false, debts, message, error: result.error, failedDebt: debt };
    }
    savedIds.push(debt.id);
  }
  const reloaded = await store.reload();
  if (reloaded.error) { logDebtSaveError('reload after successful debt writes', reloaded.error); return { ok: true, debts, message: 'Debts saved.', warning: 'Your debts were saved, but the refreshed list is temporarily unavailable.' }; }
  const removed = reloaded.rows.map(row => String(row.id)).filter(id => !savedIds.includes(id));
  if (removed.length) {
    const cleanup = await store.remove(removed);
    if (cleanup.error) { logDebtSaveError('remove deleted debts', cleanup.error); return { ok: true, debts: reloaded.rows.map(mapDebtRow), message: 'Debts saved.', warning: 'Your debts were saved, but an older debt could not be removed.' }; }
  }
  const final = removed.length ? await store.reload() : reloaded;
  if (final.error) return { ok: true, debts, message: 'Debts saved.', warning: 'Your debts were saved, but the refreshed list is temporarily unavailable.' };
  return { ok: true, debts: final.rows.map(mapDebtRow), message: 'Debts saved.' };
}
