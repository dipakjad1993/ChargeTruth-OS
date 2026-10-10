/* V2H/V2G safe-stop: charge cheap, discharge at home peak — only if vehicle.v2x.
   Tariff model is user-editable; defaults are IN/US placeholders. */
export function v2hPlan({ vehicle, homeTariffPeak = 9, homeTariffOffPeak = 4.5, currency = '₹', dischargeKwh = 10, roundTripEff = 0.85 }) {
  if (!vehicle.v2x) return { eligible: false, reason: `${vehicle.name} has no bidirectional (V2L/V2H) support — V2H tab disabled for this vehicle.` };
  const cost = dischargeKwh / roundTripEff * homeTariffOffPeak;
  const value = dischargeKwh * homeTariffPeak;
  const saving = value - cost;
  return {
    eligible: true,
    chargeOffPeakKwh: +(dischargeKwh / roundTripEff).toFixed(1),
    dischargeKwh, cost: +cost.toFixed(0), value: +value.toFixed(0), saving: +saving.toFixed(0), currency,
    plan: `Charge ${vehicle.name} to 90% at off-peak (${currency}${homeTariffOffPeak}/kWh) near your stop, drive home, discharge ${dischargeKwh} kWh at peak (${currency}${homeTariffPeak}/kWh). Net ≈ ${currency}${saving.toFixed(0)}/cycle. Keep 20% floor — never strand the morning commute.`,
    warnings: ['Needs bidirectional EVSE (e.g. 7kW V2H) + utility approval', 'LFP packs (BYD/Tata) tolerate V2H better than NMC — cap 1 cycle/day', 'Winter: keep 30% floor, heating eats reserve']
  };
}
