within ;
model Miscellaneous
  final model RefrigerantCycleChillerCooling =
    Buildings.Fluid.Chillers.ModularReversible.RefrigerantCycle.TableData2DLoadDep(
      final useInChi=true,
      redeclare final Buildings.Fluid.HeatPumps.ModularReversible.RefrigerantCycle.Frosting.NoFrosting iceFacCal,
      redeclare model RefrigerantCycleInertia=
        Buildings.Fluid.HeatPumps.ModularReversible.RefrigerantCycle.Inertias.VariableOrder(
          refIneFreConst=1 / 300,
          nthOrd=1,
          initType=Modelica.Blocks.Types.Init.InitialState),
      final dat=datCoo,
      final P_min=P_min)
    "Refrigerant cycle module for the cooling mode"
    annotation(choicesAllMatching=true,
      Placement(transformation(extent={{114,-18},{130,-2}})));
  final parameter Modelica.Units.SI.HeatFlowRate QChg_flow_nominal =
    eps_nominal *
      min(
        {mLiq_flow_nominal * cpLiq_nominal, mAir_flow_nominal * cpTestAirChg_nominal}) *
      (TLiqEntChg_nominal - TAirEntChg_nominal);
  final parameter Modelica.Units.SI.HeatFlowRate Q_flow_nominal =
    (MediumLiq.specificEnthalpy_pTX(
      MediumLiq.p_default,
      TLiqEnt_nominal,
      X=MediumLiq.X_default) -
      MediumLiq.specificEnthalpy_pTX(
        MediumLiq.p_default,
        TLiqLvg_nominal,
        X=MediumLiq.X_default)) * mLiq_flow_nominal
    "Transmitted heat flow rate at design conditions";
end Miscellaneous;
