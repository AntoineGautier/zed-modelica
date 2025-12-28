within;
block IfThenElse
  final parameter Modelica.Units.SI.PressureDifference dpBalHeaWatHp_nominal =
    if is_dpBalYPumSetCal and
    typPumHeaWatPri == Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant
    then Buildings.Templates.Utilities.computeBalancingPressureDrop(m_flow_nominal=hp.mHeaWatHp_flow_nominal,
    dp_nominal=hp.dpHeaWatHp_nominal + max(valIso.dpValveHeaWat_nominal) *
        ((if have_valHpInlIso then 1 else 0) +
          (if have_valHpOutIso then 1 else 0)) + dpValCheHeaWat_nominal,
      datPum=dat.pumHeaWatPriSin[1])
    else dat.dpBalHeaWatHp_nominal
    "HP HW balancing valve pressure drop at design HW flow";
  final parameter Modelica.Units.SI.PressureDifference dpBalChiWatHp_nominal =
    if is_dpBalYPumSetCal and
    (typPumChiWatPri == Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant or
      have_chiWat and not have_pumChiWatPriDed and
      typPumHeaWatPri == Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant)
    then Buildings.Templates.Utilities.computeBalancingPressureDrop(m_flow_nominal=hp.mChiWatHp_flow_nominal,
    dp_nominal=hp.dpChiWatHp_nominal + max(valIso.dpValveChiWat_nominal) *
        ((if have_valHpInlIso then 1 else 0) +
          (if have_valHpOutIso then 1 else 0)) + dpValCheChiWat_nominal,
      datPum=if cfg.typPumChiWatPri == Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant
        then dat.pumChiWatPriSin[1] else dat.pumHeaWatPriSin[1])
    else dat.dpBalChiWatHp_nominal
    "HP CHW balancing valve pressure drop at design CHW flow";
    equation
      when {u, reset} then
        entryTime = time;
        passed = u and t <= 0;
      elsewhen u and time >= pre(entryTime) + t then
        entryTime = pre(entryTime);
        passed = true;
      elsewhen not u then
        entryTime = pre(entryTime);
        passed = false;
      end when;
      y = if u then time - entryTime else 0.0;
      annotation (
        __cdl(
          extensionBlock=true));
  end IfThenElse;
