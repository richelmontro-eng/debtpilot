export type VehicleScenario = {
  price: number;
  downPayment: number;
  tradeIn: number;
  taxRate: number;
  fees: number;
  apr: number;
  termMonths: number;
  insuranceMonthly: number;
  fuelMonthly: number;
  maintenanceMonthly: number;
};

export type FinancialContext = {
  monthlyIncome: number;
  monthlyBills: number;
  monthlyDebtMinimums: number;
  monthlyLiving: number;
  checking: number;
  savings: number;
  checkingCushion: number;
};

export type VehicleDecision = {
  amountFinanced: number;
  paymentMonthly: number;
  ownershipMonthly: number;
  ownershipWeekly: number;
  totalLoanInterest: number;
  cashDueAtPurchase: number;
  monthlySurplusBefore: number;
  monthlySurplusAfter: number;
  emergencyMonthsAfterPurchase: number;
  readiness: number;
  recommendation: 'READY' | 'CAUTION' | 'WAIT';
  reasons: string[];
};

export function monthlyLoanPayment(principal: number, annualRate: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const monthlyRate = Math.max(0, annualRate) / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  return principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}

export function evaluateVehicle(scenario: VehicleScenario, finances: FinancialContext): VehicleDecision {
  const taxablePrice = Math.max(0, scenario.price - scenario.tradeIn);
  const tax = taxablePrice * Math.max(0, scenario.taxRate) / 100;
  const amountFinanced = Math.max(0, scenario.price + tax + scenario.fees - scenario.downPayment - scenario.tradeIn);
  const paymentMonthly = monthlyLoanPayment(amountFinanced, scenario.apr, scenario.termMonths);
  const ownershipMonthly = paymentMonthly + scenario.insuranceMonthly + scenario.fuelMonthly + scenario.maintenanceMonthly;
  const ownershipWeekly = ownershipMonthly * 12 / 52;
  const totalLoanInterest = Math.max(0, paymentMonthly * scenario.termMonths - amountFinanced);
  const cashDueAtPurchase = Math.max(0, scenario.downPayment + scenario.fees);

  const existingMonthlyOutflow = finances.monthlyBills + finances.monthlyDebtMinimums + finances.monthlyLiving;
  const monthlySurplusBefore = finances.monthlyIncome - existingMonthlyOutflow;
  const monthlySurplusAfter = monthlySurplusBefore - ownershipMonthly;
  const savingsAfterPurchase = Math.max(0, finances.savings - cashDueAtPurchase);
  const essentialAfterPurchase = Math.max(1, existingMonthlyOutflow + ownershipMonthly);
  const emergencyMonthsAfterPurchase = savingsAfterPurchase / essentialAfterPurchase;

  let score = 100;
  const reasons: string[] = [];
  const ownershipRatio = finances.monthlyIncome > 0 ? ownershipMonthly / finances.monthlyIncome : 1;

  if (monthlySurplusAfter < 0) {
    score -= 55;
    reasons.push('The estimated vehicle cost is greater than your current monthly surplus.');
  } else if (monthlySurplusAfter < finances.monthlyIncome * 0.1) {
    score -= 25;
    reasons.push('The purchase would leave less than 10% of monthly income unassigned.');
  } else {
    reasons.push('Your projected monthly cash flow remains positive after the purchase.');
  }

  if (ownershipRatio > 0.2) {
    score -= 25;
    reasons.push('Total vehicle cost is above 20% of monthly take-home income.');
  } else if (ownershipRatio > 0.15) {
    score -= 12;
    reasons.push('Total vehicle cost is between 15% and 20% of monthly take-home income.');
  } else {
    reasons.push('Total vehicle cost stays below 15% of monthly take-home income.');
  }

  if (emergencyMonthsAfterPurchase < 1) {
    score -= 25;
    reasons.push('The upfront cash would leave less than one month of estimated essential expenses in savings.');
  } else if (emergencyMonthsAfterPurchase < 3) {
    score -= 10;
    reasons.push('Savings would remain below a three-month emergency reserve after purchase.');
  } else {
    reasons.push('Savings remain at or above three months of estimated essential expenses.');
  }

  if (finances.checking < finances.checkingCushion) {
    score -= 15;
    reasons.push('Your checking balance is currently below the protected cushion.');
  }

  if (scenario.termMonths > 72) {
    score -= 8;
    reasons.push('The loan term is longer than 72 months, increasing long-term interest and negative-equity risk.');
  }

  const readiness = Math.max(0, Math.min(100, Math.round(score)));
  const recommendation = readiness >= 80 ? 'READY' : readiness >= 60 ? 'CAUTION' : 'WAIT';

  return {
    amountFinanced,
    paymentMonthly,
    ownershipMonthly,
    ownershipWeekly,
    totalLoanInterest,
    cashDueAtPurchase,
    monthlySurplusBefore,
    monthlySurplusAfter,
    emergencyMonthsAfterPurchase,
    readiness,
    recommendation,
    reasons,
  };
}
