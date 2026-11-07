import React, { useState, useEffect, useRef } from 'react';
import { 
  Car, Zap, Flame, Shirt, Sparkles, Plug, 
  ExternalLink, CheckCircle2, AlertCircle, RefreshCw,
  Power, ArrowDownUp
} from 'lucide-react';

export interface TelemetryField<T = number | string> {
  value: T;
  unit?: string;
  description?: string;
}

export interface TelemetryData {
  ev?: {
    current_power?: TelemetryField<number>;
    status?: TelemetryField<string>;
    charged_today?: TelemetryField<number>;
    charged_month?: TelemetryField<number>;
    total_counter?: TelemetryField<number>;
    [key: string]: any;
  };
  grid?: {
    dc_power?: TelemetryField<number>;
    boilerpower?: TelemetryField<number>;
    boilerpowerday?: TelemetryField<number>;
    boilerpowertotal?: TelemetryField<number>;
    boilerpowertotaldaystart?: TelemetryField<number>;
    waspower?: TelemetryField<number>;
    waspowerday?: TelemetryField<number>;
    waspowertotal?: TelemetryField<number>;
    vaatwaspower?: TelemetryField<number>;
    vaatwaspowerday?: TelemetryField<number>;
    plugpower?: TelemetryField<number>;
    plugpowerday?: TelemetryField<number>;
    [key: string]: any;
  };
  [key: string]: any;
}

const DEFAULT_MOCK_DATA: TelemetryData = {
  ev: {
    current_power: { value: 0, unit: 'W', description: 'Current power drawn by EV charger' },
    status: { value: 'Idle', unit: '', description: 'Charger status' },
    charged_today: { value: 4.8, unit: 'kWh', description: 'Accumulated energy charged today' },
    charged_month: { value: 94.2, unit: 'kWh', description: 'Month cumulative charged energy' },
    total_counter: { value: 1450.8, unit: 'kWh', description: 'Lifetime cumulative charged energy' },
  },
  grid: {
    dc_power: { value: 0, unit: 'W', description: 'Power provided in reverse by DC V2G charger' },
    boilerpower: { value: 354.6, unit: 'W', description: 'Instantaneous power drawn by boiler' },
    boilerpowerday: { value: 2804.5, unit: 'Wh', description: 'Total electrical energy consumed by boiler today' },
    boilerpowertotal: { value: 489320, unit: 'Wh', description: 'Lifetime boiler consumption counter' },
    waspower: { value: 1850.0, unit: 'W', description: 'Current power consumed by washing machine' },
    waspowerday: { value: 1420.0, unit: 'Wh', description: 'Total energy consumed by laundry today' },
    waspowertotal: { value: 215400, unit: 'Wh', description: 'Lifetime laundry counter' },
    vaatwaspower: { value: 0, unit: 'W', description: 'Current power draw of dishwasher' },
    vaatwaspowerday: { value: 920.0, unit: 'Wh', description: 'Total energy consumed by dishwasher today' },
    plugpower: { value: 0, unit: 'W', description: 'Current power consumption of auxiliary smart plug' },
    plugpowerday: { value: 185.0, unit: 'Wh', description: 'Total energy consumed by plug today' },
  }
};

interface EnergyDevicesWidgetProps {
  endpoint?: string;
  className?: string;
}

export const EnergyDevicesWidget: React.FC<EnergyDevicesWidgetProps> = ({ 
  endpoint = 'https://einstein-victron.taile3356b.ts.net:1881/evdata',
  className = ''
}) => {
  const [data, setData] = useState<TelemetryData>(DEFAULT_MOCK_DATA);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const timerRef = useRef<number | null>(null);

  // App launcher helpers
  const openKiaApp = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
      if (isAndroid) {
        window.location.href = 'intent://#Intent;package=com.kia.oneapp.eu;scheme=kiaeu;end';
      } else {
        window.location.href = 'kiaeu://';
      }
    } catch {
      window.location.href = 'kiaeu://';
    }
  };

  const openShellyApp = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
      if (isAndroid) {
        window.location.href = 'intent://#Intent;package=cloud.shelly.smartcontrol;scheme=shellysmartcontrol;S.browser_fallback_url=https%3A%2F%2Fcontrol.shelly.cloud;end';
      } else {
        const timeout = setTimeout(() => {
          window.open('https://control.shelly.cloud/', '_blank');
        }, 1200);
        window.location.href = 'shellysmartcontrol://';
      }
    } catch {
      window.open('https://control.shelly.cloud/', '_blank');
    }
  };

  const fetchTelemetry = async () => {
    try {
      setIsRefreshing(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: TelemetryData = await res.json();
      
      setData(json);
      setIsLive(true);
      setLastUpdated(new Date());
    } catch (err) {
      // Fallback seamlessly to mock data when VPN/network is unavailable
      setIsLive(false);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    timerRef.current = window.setInterval(fetchTelemetry, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [endpoint]);

  // Telemetry extractions
  const evCurrentPower = Number(data?.ev?.current_power?.value ?? 0);
  const evStatus = String(data?.ev?.status?.value ?? 'Idle');
  const evChargedToday = Number(data?.ev?.charged_today?.value ?? 0);
  const gridDcPower = Number(data?.grid?.dc_power?.value ?? 0);

  const boilerPower = Number(data?.grid?.boilerpower?.value ?? 0);
  const boilerDay = Number(data?.grid?.boilerpowerday?.value ?? 0);

  const wasPower = Number(data?.grid?.waspower?.value ?? 0);
  const wasDay = Number(data?.grid?.waspowerday?.value ?? 0);

  const vaatwasPower = Number(data?.grid?.vaatwaspower?.value ?? 0);
  const vaatwasDay = data?.grid?.vaatwaspowerday?.value !== undefined ? Number(data.grid.vaatwaspowerday.value) : null;

  const plugPower = Number(data?.grid?.plugpower?.value ?? 0);
  const plugDay = data?.grid?.plugpowerday?.value !== undefined ? Number(data.grid.plugpowerday.value) : null;

  // 1. EV Operational Logic:
  // - Discharging / V2G Mode: grid.dc_power > 0
  // - Charging Mode: ev.current_power >= 10 W (and not discharging)
  // - Idle Mode: Power < 10 W and DC power <= 0
  const isEvDischarging = gridDcPower > 0;
  const isEvCharging = !isEvDischarging && evCurrentPower >= 10;
  const isEvIdle = !isEvDischarging && !isEvCharging;

  // Thresholds for the other 4 devices (5 W)
  const isBoilerActive = boilerPower >= 5;
  const isWasActive = wasPower >= 5;
  const isVaatwasActive = vaatwasPower >= 5;
  const isPlugActive = plugPower >= 5;

  const activeCount = [
    !isEvIdle,
    isBoilerActive,
    isWasActive,
    isVaatwasActive,
    isPlugActive
  ].filter(Boolean).length;

  return (
    <div className={`p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 transition-all hover:border-gray-200 text-left flex flex-col gap-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-amber-500" />
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">
            Toestellen & Verbruik
          </span>
          {activeCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200/60 rounded-full text-[9px] font-black tracking-wider uppercase">
              {activeCount} actief
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isLive ? (
            <span className="text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1.5 tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1.5 tracking-wider" title="VPN verbinding niet actief, toont mock telemetry">
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              STANDBY
            </span>
          )}

          <button
            onClick={fetchTelemetry}
            className="w-7 h-7 flex items-center justify-center bg-gray-50 text-gray-400 hover:text-gray-900 rounded-lg transition-colors active:scale-95"
            title="Vernieuwen"
          >
            <RefreshCw size={11} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
          </button>
        </div>
      </div>

      {/* Main Container of the 5 Widgets */}
      <div className="flex flex-col gap-3">
        {/* ============================================================ */}
        {/* 1. EV Charger Widget */}
        {/* ============================================================ */}
        <div
          onClick={openKiaApp}
          className={`w-full p-5 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] select-none ${
            isEvDischarging
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-sm shadow-emerald-100'
              : isEvCharging
              ? 'bg-red-50/90 border-red-300 text-red-950 shadow-sm shadow-red-100'
              : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300'
          }`}
          title="Klik om Kia Connect te openen"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                isEvDischarging
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                  : isEvCharging
                  ? 'bg-red-500 text-white shadow-md shadow-red-200'
                  : 'bg-white text-slate-400 border border-slate-200'
              }`}>
                {isEvDischarging ? (
                  <ArrowDownUp size={20} className="animate-pulse" />
                ) : (
                  <Car size={20} />
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    EV Charger
                  </h4>
                  <span className="text-[9px] font-bold text-gray-400 opacity-60">Kia</span>
                </div>
                <p className={`text-[11px] font-bold uppercase tracking-wider mt-0.5 ${
                  isEvDischarging
                    ? 'text-emerald-700'
                    : isEvCharging
                    ? 'text-red-700'
                    : 'text-slate-400'
                }`}>
                  {isEvDischarging
                    ? 'Discharging (V2G)'
                    : isEvCharging
                    ? (evStatus || 'Charging')
                    : 'Idle'}
                </p>
              </div>
            </div>

            <div className="text-right flex flex-col items-end">
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-black tabular-nums tracking-tight ${
                  isEvDischarging
                    ? 'text-emerald-700'
                    : isEvCharging
                    ? 'text-red-700'
                    : 'text-slate-500'
                }`}>
                  {isEvDischarging
                    ? Math.round(gridDcPower)
                    : isEvCharging
                    ? Math.round(evCurrentPower)
                    : 'Idle'}
                </span>
                {(isEvDischarging || isEvCharging) && (
                  <span className="text-xs font-black opacity-60">W</span>
                )}
              </div>
              <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                Vandaag: {evChargedToday ? evChargedToday.toFixed(1) : '0'} kWh
              </span>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2x2 Grid for Boiler, Laundry, Vaatwas, and Plug */}
        {/* ============================================================ */}
        <div className="grid grid-cols-2 gap-3">
          {/* ========================================================== */}
          {/* 2. Boiler Widget */}
          {/* ========================================================== */}
          <div
            onClick={openShellyApp}
            className={`p-4 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] select-none flex flex-col justify-between min-h-[110px] ${
              isBoilerActive
                ? 'bg-rose-50/90 border-rose-300 text-rose-950 shadow-sm shadow-rose-100'
                : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300'
            }`}
            title="Klik om Shelly Smart Control te openen"
          >
            <div className="flex items-center justify-between">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isBoilerActive
                  ? 'bg-rose-500 text-white shadow-sm shadow-rose-200'
                  : 'bg-white text-slate-400 border border-slate-200'
              }`}>
                <Flame size={16} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 opacity-60">
                Shelly ↗
              </span>
            </div>

            <div className="mt-2">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-gray-900 truncate">
                Boiler
              </h5>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-xl font-black tabular-nums tracking-tight ${
                  isBoilerActive ? 'text-rose-700' : 'text-slate-500'
                }`}>
                  {isBoilerActive ? boilerPower.toFixed(1) : 'Idle'}
                </span>
                {isBoilerActive && <span className="text-[10px] font-black opacity-60">W</span>}
              </div>
            </div>

            <div className="mt-1 pt-1.5 border-t border-black/5 flex items-center justify-between text-[9px] font-bold text-gray-400 tabular-nums">
              <span>Vandaag</span>
              <span>{boilerDay ? boilerDay.toFixed(1) : '0'} Wh</span>
            </div>
          </div>

          {/* ========================================================== */}
          {/* 3. Laundry / Washing Machine Widget */}
          {/* ========================================================== */}
          <div
            onClick={openShellyApp}
            className={`p-4 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] select-none flex flex-col justify-between min-h-[110px] ${
              isWasActive
                ? 'bg-blue-50/90 border-blue-300 text-blue-950 shadow-sm shadow-blue-100'
                : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300'
            }`}
            title="Klik om Shelly Smart Control te openen"
          >
            <div className="flex items-center justify-between">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isWasActive
                  ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                  : 'bg-white text-slate-400 border border-slate-200'
              }`}>
                <Shirt size={16} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 opacity-60">
                Shelly ↗
              </span>
            </div>

            <div className="mt-2">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-gray-900 truncate">
                Wasmachine
              </h5>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-xl font-black tabular-nums tracking-tight ${
                  isWasActive ? 'text-blue-700' : 'text-slate-500'
                }`}>
                  {isWasActive ? Math.round(wasPower) : 'Idle'}
                </span>
                {isWasActive && <span className="text-[10px] font-black opacity-60">W</span>}
              </div>
            </div>

            <div className="mt-1 pt-1.5 border-t border-black/5 flex items-center justify-between text-[9px] font-bold text-gray-400 tabular-nums">
              <span>Vandaag</span>
              <span>{wasDay ? wasDay.toFixed(0) : '0'} Wh</span>
            </div>
          </div>

          {/* ========================================================== */}
          {/* 4. Vaatwas / Dishwasher Widget */}
          {/* ========================================================== */}
          <div
            onClick={openShellyApp}
            className={`p-4 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] select-none flex flex-col justify-between min-h-[110px] ${
              isVaatwasActive
                ? 'bg-cyan-50/90 border-cyan-300 text-cyan-950 shadow-sm shadow-cyan-100'
                : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300'
            }`}
            title="Klik om Shelly Smart Control te openen"
          >
            <div className="flex items-center justify-between">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isVaatwasActive
                  ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-200'
                  : 'bg-white text-slate-400 border border-slate-200'
              }`}>
                <Sparkles size={16} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 opacity-60">
                Shelly ↗
              </span>
            </div>

            <div className="mt-2">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-gray-900 truncate">
                Vaatwasser
              </h5>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-xl font-black tabular-nums tracking-tight ${
                  isVaatwasActive ? 'text-cyan-700' : 'text-slate-500'
                }`}>
                  {isVaatwasActive ? vaatwasPower.toFixed(1) : 'Idle'}
                </span>
                {isVaatwasActive && <span className="text-[10px] font-black opacity-60">W</span>}
              </div>
            </div>

            <div className="mt-1 pt-1.5 border-t border-black/5 flex items-center justify-between text-[9px] font-bold text-gray-400 tabular-nums">
              <span>Status</span>
              <span>{isVaatwasActive ? 'Actief' : 'Standby'}</span>
            </div>
          </div>

          {/* ========================================================== */}
          {/* 5. Plug Widget */}
          {/* ========================================================== */}
          <div
            onClick={openShellyApp}
            className={`p-4 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] select-none flex flex-col justify-between min-h-[110px] ${
              isPlugActive
                ? 'bg-orange-50/90 border-orange-300 text-orange-950 shadow-sm shadow-orange-100'
                : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300'
            }`}
            title="Klik om Shelly Smart Control te openen"
          >
            <div className="flex items-center justify-between">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isPlugActive
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
                  : 'bg-white text-slate-400 border border-slate-200'
              }`}>
                <Plug size={16} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 opacity-60">
                Shelly ↗
              </span>
            </div>

            <div className="mt-2">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-gray-900 truncate">
                Stekker
              </h5>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-xl font-black tabular-nums tracking-tight ${
                  isPlugActive ? 'text-orange-700' : 'text-slate-500'
                }`}>
                  {isPlugActive ? plugPower.toFixed(1) : 'Idle'}
                </span>
                {isPlugActive && <span className="text-[10px] font-black opacity-60">W</span>}
              </div>
            </div>

            <div className="mt-1 pt-1.5 border-t border-black/5 flex items-center justify-between text-[9px] font-bold text-gray-400 tabular-nums">
              <span>Status</span>
              <span>{isPlugActive ? 'Actief' : 'Standby'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
