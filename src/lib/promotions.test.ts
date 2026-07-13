import { describe, expect, it } from 'vitest';
import { analyzePromotion, getEffectiveApr } from './promotions';

const now = new Date('2026-01-01T00:00:00');

describe('promotional interest engine', () => {
  it('uses the true promotional APR instead of the regular APR', () => {
    expect(getEffectiveApr({ balance: 1200, apr: 29, minimum: 100, promotionType: 'zero_percent', promotionalApr: 0, promotionEndDate: '2026-07-01', postPromotionApr: 29 }, now)).toBe(0);
  });

  it('flags deferred interest and reports the entered interest at risk', () => {
    const result = analyzePromotion({ balance: 3000, apr: 29, minimum: 50, promotionType: 'deferred_interest', promotionalApr: 0, promotionEndDate: '2026-04-01', postPromotionApr: 29, estimatedDeferredInterest: 700 }, { now, plannedMonthlyPayment: 50 });
    expect(result.status).toBe('at_risk');
    expect(result.estimatedInterestAtRisk).toBe(700);
  });

  it('recognizes payoff before the safety deadline', () => {
    const result = analyzePromotion({ balance: 600, apr: 25, minimum: 300, promotionType: 'zero_percent', promotionalApr: 0, promotionEndDate: '2026-07-01' }, { now, plannedMonthlyPayment: 300 });
    expect(result.preservesPromotion).toBe(true);
    expect(result.status).toBe('on_track');
  });

  it('recognizes payoff after the stated deadline', () => {
    const result = analyzePromotion({ balance: 3000, apr: 25, minimum: 100, promotionType: 'deferred_interest', promotionalApr: 0, promotionEndDate: '2026-04-01' }, { now, plannedMonthlyPayment: 100 });
    expect(result.preservesPromotion).toBe(false);
    expect(result.status).toBe('at_risk');
  });

  it('marks an expired promotion', () => {
    expect(analyzePromotion({ balance: 500, apr: 25, minimum: 50, promotionType: 'zero_percent', promotionEndDate: '2025-12-31' }, { now }).status).toBe('expired');
  });

  it('calculates exact monthly deadline payments', () => {
    const result = analyzePromotion({ balance: 3000, apr: 25, minimum: 100, promotionType: 'zero_percent', promotionEndDate: '2026-05-01' }, { now });
    expect(result.safetyTargetDate?.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(result.requiredMonthlyPayment).toBe(1000);
  });

  it('uses a safety target 30 days before expiration', () => {
    const result = analyzePromotion({ balance: 1000, apr: 25, minimum: 100, promotionType: 'zero_percent', promotionEndDate: '2026-07-01' }, { now });
    expect(result.safetyTargetDate?.toISOString().slice(0, 10)).toBe('2026-06-01');
  });
});
