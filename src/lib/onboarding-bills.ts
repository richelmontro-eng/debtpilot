export const BILL_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
export type BillFrequency = typeof BILL_FREQUENCIES[number];

export type OnboardingBill = {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  frequency: string;
};

export type BillSaveError = { code?: string; message?: string; details?: string; hint?: string };

export type BillStore = {
  upsert: (bill: OnboardingBill) => Promise<{ error: BillSaveError | null }>;
  reload: () => Promise<{ bills: OnboardingBill[]; error: BillSaveError | null }>;
  remove: (ids: string[]) => Promise<{ error: BillSaveError | null }>;
};

export type BillSaveResult = {
  ok: boolean;
  savedIds: string[];
  message: string;
  bills: OnboardingBill[];
  warning?: string;
  failedBill?: OnboardingBill;
  error?: BillSaveError;
};

function billName(bill: OnboardingBill) {
  return bill.name.trim() || 'This bill';
}

export function validateOnboardingBill(bill: OnboardingBill) {
  if (!bill.name.trim()) return 'Enter a name for this bill.';
  if (!Number.isFinite(bill.amount) || bill.amount <= 0) return `${billName(bill)} needs an amount greater than $0.`;
  if (!Number.isInteger(bill.dueDay) || bill.dueDay < 1 || bill.dueDay > 31) return `We couldn't save ${billName(bill)} because its due date is missing or invalid.`;
  if (!BILL_FREQUENCIES.includes(bill.frequency as BillFrequency)) return `Choose a valid frequency for ${billName(bill)}.`;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bill.id)) return `${billName(bill)} has an invalid local identifier. Remove it and add it again.`;
  return null;
}

export function logBillSaveError(context: string, error: BillSaveError, bill?: OnboardingBill) {
  if (process.env.NODE_ENV === 'production') return;
  console.error('[DebtPilot bill save]', {
    context,
    billId: bill?.id,
    billName: bill?.name,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

export function getSafeBillSaveMessage(bill: OnboardingBill, error: BillSaveError) {
  if (error.code === '23514' && /due_day/i.test(`${error.message} ${error.details}`)) return `We couldn't save ${billName(bill)} because its due date is missing or invalid.`;
  if (error.code === '23514' && /amount/i.test(`${error.message} ${error.details}`)) return `${billName(bill)} needs an amount greater than $0.`;
  if (error.code === '23514' && /frequency/i.test(`${error.message} ${error.details}`)) return `Choose a valid frequency for ${billName(bill)}.`;
  return `${billName(bill)} could not be saved. Please try again.`;
}

export async function saveOnboardingBills(store: BillStore, bills: OnboardingBill[]): Promise<BillSaveResult> {
  for (const bill of bills) {
    const validation = validateOnboardingBill(bill);
    if (validation) return { ok: false, savedIds: [], bills: [], message: validation, failedBill: bill };
  }

  const savedIds: string[] = [];
  for (const bill of bills) {
    const { error } = await store.upsert({ ...bill, name: bill.name.trim() });
    if (error) {
      logBillSaveError('upsert', error, bill);
      return { ok: false, savedIds, bills: [], message: getSafeBillSaveMessage(bill, error), failedBill: bill, error };
    }
    savedIds.push(bill.id);
  }

  const reloaded = await store.reload();
  if (reloaded.error) {
    logBillSaveError('reload bills after successful writes', reloaded.error);
    return { ok: true, savedIds, bills, message: 'Bills saved.', warning: 'Your bills were saved, but the refreshed list is temporarily unavailable.' };
  }
  const removedIds = reloaded.bills.map(bill => bill.id).filter(id => !savedIds.includes(id));
  if (removedIds.length) {
    const removed = await store.remove(removedIds);
    if (removed.error) {
      logBillSaveError('remove deleted onboarding bills', removed.error);
      return { ok: true, savedIds, bills: reloaded.bills, message: 'Bills saved.', warning: 'Your bills were saved, but an older bill could not be removed.' };
    }
  }
  const finalReload = removedIds.length ? await store.reload() : reloaded;
  if (finalReload.error) {
    logBillSaveError('reload bills after duplicate cleanup', finalReload.error);
    return { ok: true, savedIds, bills, message: 'Bills saved.', warning: 'Your bills were saved, but the refreshed list is temporarily unavailable.' };
  }
  return { ok: true, savedIds, bills: finalReload.bills, message: bills.length ? 'Bills saved.' : 'No bills to save.' };
}
