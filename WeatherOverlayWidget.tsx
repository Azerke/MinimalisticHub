import React, { useState, useEffect } from 'react';
import { 
  Cloud, Sun, CloudRain, CloudLightning, Wind, X,
  CloudSnow, CloudDrizzle, RefreshCw
} from 'lucide-react';

interface WeatherData {
  location: string; 
  currentTemp: number; 
  condition: string; 
  humidity: number; 
  windSpeed: string;
  hourly: { 
    time: string; 
    temp: number; 
    icon: 'sun' | 'cloud' | 'rain' | 'storm' | 'snow' | 'drizzle' 
  }[];
  daily: { 
    day: string; 
    low: number; 
    high: number; 
    condition: string; 
    icon: 'sun' | 'cloud' | 'rain' | 'storm' | 'snow' | 'drizzle' 
  }[];
}

interface WeatherOverlayProps {
  onClose: () => void;
  weatherData: WeatherData | null;
  loading: boolean;
}

const getWeatherIcon = (icon: string, size = 48) => {
  switch (icon) {
    case 'sun': return <Sun size={size} />;
    case 'cloud': return <Cloud size={size} />;
    case 'rain': return <CloudRain size={size} />;
    case 'storm': return <CloudLightning size={size} />;
    case 'snow': return <CloudSnow size={size} />;
    case 'drizzle': return <CloudDrizzle size={size} />;
    default: return <Cloud size={size} />;
  }
};

export const WeatherOverlay: React.FC<WeatherOverlayProps> = ({ onClose, weatherData, loading }) => {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center animate-in fade-in bg-black/80 backdrop-blur-md p-10">
      <div className="bg-[#1a1a1a] w-full max-w-7xl h-[90vh] rounded-[3rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl">
        <div className="p-8 bg-[#222] border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-4 text-sky-400">
            <Cloud size={24} />
            <h3 className="font-black text-xs uppercase tracking-[0.4em]">Weersvoorspelling</h3>
          </div>
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all">
            <X size={24} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw size={48} className="animate-spin text-sky-400/50" />
          </div>
        ) : weatherData ? (
          <div className="flex-1 overflow-y-auto p-12 space-y-12">
            <div className="bg-gradient-to-br from-sky-500/10 to-blue-500/10 rounded-[2rem] p-12 border border-white/10">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h4 className="text-white/40 text-xs font-bold uppercase tracking-[0.3em] mb-2">Locatie</h4>
                  <p className="text-white text-4xl font-black">{weatherData.location}</p>
                </div>
                <div className="text-sky-400">
                  {getWeatherIcon(weatherData.hourly[0]?.icon || 'cloud', 120)}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-6">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mb-2">Temperatuur</p>
                  <p className="text-white text-5xl font-black">{weatherData.currentTemp}°</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mb-2">Conditie</p>
                  <p className="text-white text-xl font-bold">{weatherData.condition}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mb-2">Vochtigheid</p>
                  <p className="text-white text-5xl font-black">{weatherData.humidity}%</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mb-2">Windsnelheid</p>
                  <p className="text-white text-xl font-bold flex items-center gap-2">
                    <Wind size={24} className="text-sky-400" />
                    {weatherData.windSpeed}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-white/60 text-xs font-black uppercase tracking-[0.4em] mb-6">Vandaag - Per Uur</h4>
              <div className="grid grid-cols-8 gap-4">
                {weatherData.hourly.map((h, i) => (
                  <div key={i} className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col items-center gap-3 hover:bg-white/10 transition-all">
                    <p className="text-white/40 text-xs font-bold">{h.time}</p>
                    <div className="text-sky-400">
                      {getWeatherIcon(h.icon, 32)}
                    </div>
                    <p className="text-white text-2xl font-black">{h.temp}°</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-white/60 text-xs font-black uppercase tracking-[0.4em] mb-6">7-Daagse Voorspelling</h4>
              <div className="grid grid-cols-7 gap-4">
                {weatherData.daily.map((d, i) => (
                  <div key={i} className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col items-center gap-4 hover:bg-white/10 transition-all">
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">{d.day}</p>
                    <div className="text-sky-400">
                      {getWeatherIcon(d.icon, 40)}
                    </div>
                    <div className="text-center">
                      <p className="text-white text-xl font-black">{d.high}°</p>
                      <p className="text-white/40 text-sm">{d.low}°</p>
                    </div>
                    <p className="text-white/60 text-xs text-center">{d.condition}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-white/40 text-sm">Geen weergegevens beschikbaar</p>
          </div>
        )}
      </div>
    </div>
  );
};
