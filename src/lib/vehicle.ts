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
  existingVehicleMonthly?: number;
};

export type VehicleCoach = {
  affordable: boolean; safeVehicleBudget: number; targetMonthlyPayment: number; maximumLoanAmount: number;
  recommendedMaximumPrice: number; affordablePriceLow: number; affordablePriceHigh: number;
  requiredDownPayment: number; additionalDownPaymentRequired: number; monthlyPaymentDifference: number;
  monthsToSaveDifference: number | null; confidence: number; reasoning: string[]; assumptions: string[];
  impacts: { checkingCushion: string; debts: string; goals: string }; alternatives: { title: string; detail: string }[];
  calculation: string;
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
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(months) || principal <= 0 || months <= 0) return 0;
  const monthlyRate = Math.max(0, annualRate) / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  return principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}

export function maximumPrincipalForPayment(payment: number, annualRate: number, months: number) {
  if (payment <= 0 || months <= 0) return 0;
  const rate = Math.max(0, annualRate) / 100 / 12;
  return rate === 0 ? payment * months : payment * (1 - Math.pow(1 + rate, -months)) / rate;
}

export function coachVehicle(scenario: VehicleScenario, finances: FinancialContext): VehicleCoach {
  const operating = Math.max(0, scenario.insuranceMonthly) + Math.max(0, scenario.fuelMonthly) + Math.max(0, scenario.maintenanceMonthly);
  const existingVehicle = Math.max(0, finances.existingVehicleMonthly ?? 0);
  const cushionGap = Math.max(0, finances.checkingCushion - finances.checking);
  const essentialSurplus = finances.monthlyIncome - finances.monthlyBills - finances.monthlyDebtMinimums - finances.monthlyLiving - cushionGap;
  const safeVehicleBudget = Math.max(0, Math.min(finances.monthlyIncome * 0.15, essentialSurplus) - existingVehicle);
  const targetMonthlyPayment = Math.max(0, safeVehicleBudget - operating);
  const maximumLoanAmount = maximumPrincipalForPayment(targetMonthlyPayment, scenario.apr, scenario.termMonths);
  const tax = Math.max(0, scenario.taxRate) / 100;
  const recommendedMaximumPrice = Math.max(0, (maximumLoanAmount + Math.max(0, scenario.downPayment) + Math.max(0, scenario.tradeIn) + tax * Math.max(0, scenario.tradeIn)) / (1 + tax));
  const financedAtEnteredPrice = Math.max(0, scenario.price + Math.max(0, scenario.price - scenario.tradeIn) * tax - scenario.tradeIn);
  const requiredDownPayment = Math.max(0, financedAtEnteredPrice - maximumLoanAmount);
  const additionalDownPaymentRequired = Math.max(0, requiredDownPayment - Math.max(0, scenario.downPayment));
  const decision = evaluateVehicle(scenario, finances);
  const monthlyPaymentDifference = Math.max(0, decision.ownershipMonthly - safeVehicleBudget);
  const cashAffordable = decision.cashDueAtPurchase <= Math.max(0, finances.savings);
  const affordable = safeVehicleBudget > 0 && decision.ownershipMonthly <= safeVehicleBudget + 0.01 && cashAffordable && cushionGap === 0;
  const savingCapacity = Math.max(0, essentialSurplus - operating - existingVehicle);
  const monthsToSaveDifference = additionalDownPaymentRequired <= 0 ? 0 : savingCapacity > 0 ? Math.ceil(additionalDownPaymentRequired / savingCapacity) : null;
  const confidence = finances.monthlyIncome > 0 && scenario.price >= 0 ? 92 : 55;
  const impacts = {
    checkingCushion: cushionGap > 0 ? `Checking is already $${Math.round(cushionGap).toLocaleString()} below the protected cushion.` : affordable ? 'The protected checking cushion remains intact.' : 'Do not use the protected checking cushion to close the affordability gap.',
    debts: monthlyPaymentDifference > 0 ? `The monthly overage would compete with required debt payments and extra payoff capacity by about $${Math.round(monthlyPaymentDifference).toLocaleString()} per month.` : 'Required debt minimums remain covered.',
    goals: monthlyPaymentDifference > 0 ? `Goals could receive about $${Math.round(monthlyPaymentDifference).toLocaleString()} less per month.` : 'Key goals are not materially delayed by the modeled monthly cost.',
  };
  return {
    affordable, safeVehicleBudget, targetMonthlyPayment, maximumLoanAmount, recommendedMaximumPrice,
    affordablePriceLow: recommendedMaximumPrice * 0.8, affordablePriceHigh: recommendedMaximumPrice,
    requiredDownPayment, additionalDownPaymentRequired, monthlyPaymentDifference, monthsToSaveDifference, confidence,
    reasoning: affordable
      ? ['Total ownership cost remains within the safe monthly vehicle budget.', 'Bills, living costs, debt minimums, and the protected cushion remain covered.']
      : ['The entered total ownership cost exceeds the safe budget calculated after essential obligations.', 'A lower price or larger down payment reduces the loan payment without relying on a longer loan term.'],
    assumptions: ['Saved take-home income and recurring obligations are current.', 'Insurance, fuel, and maintenance match the amounts entered.', 'Taxes and trade-in reduce or increase the financed balance as entered.', 'The affordable range uses 80% to 100% of the calculated maximum price.'],
    impacts,
    alternatives: [
      { title: 'Lower vehicle price', detail: `Target ${Math.round(recommendedMaximumPrice * 0.8).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}–${Math.round(recommendedMaximumPrice).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}.` },
      { title: 'Increase down payment', detail: additionalDownPaymentRequired > 0 ? `Add about $${Math.ceil(additionalDownPaymentRequired).toLocaleString()} beyond the entered down payment.` : 'The entered down payment already supports the calculated maximum loan.' },
      { title: 'Extend the purchase date', detail: monthsToSaveDifference === null ? 'Monthly capacity is negative; first reduce obligations or increase income.' : `Saving the difference would take about ${monthsToSaveDifference} month${monthsToSaveDifference === 1 ? '' : 's'} at current capacity.` },
      { title: 'Reduce another monthly obligation', detail: `Free about $${Math.ceil(monthlyPaymentDifference).toLocaleString()} per month without reducing bill or debt minimum coverage.` },
    ],
    calculation: 'Safe vehicle budget is the lower of 15% of take-home income and cash remaining after bills, debt minimums, living reserve, cushion recovery, and existing vehicle obligations. Operating costs are subtracted, then the remaining payment is converted to a maximum loan principal using the entered APR and term. Taxes, trade-in, and down payment convert that principal into a maximum purchase price.',
  };
}

export function evaluateVehicle(scenario: VehicleScenario, finances: FinancialContext): VehicleDecision {
  const taxablePrice = Math.max(0, scenario.price - scenario.tradeIn);
  const tax = taxablePrice * Math.max(0, scenario.taxRate) / 100;
  // Fees are treated as cash due at signing below, so they must not also be financed.
  const amountFinanced = Math.max(0, scenario.price + tax - scenario.downPayment - scenario.tradeIn);
  const paymentMonthly = monthlyLoanPayment(amountFinanced, scenario.apr, scenario.termMonths);
  const ownershipMonthly = paymentMonthly
    + Math.max(0, scenario.insuranceMonthly)
    + Math.max(0, scenario.fuelMonthly)
    + Math.max(0, scenario.maintenanceMonthly);
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
