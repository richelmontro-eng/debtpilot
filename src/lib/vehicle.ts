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

/**
 * Financing math only. Affordability and recommendations belong to the
 * dated Pilot Engine simulation.
 */
export function monthlyLoanPayment(principal: number, annualRate: number, months: number) {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(months) || principal <= 0 || months <= 0) return 0;
  const monthlyRate = Math.max(0, annualRate) / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  return principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}
