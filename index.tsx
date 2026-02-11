import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Cloud, Sun, CloudRain, CloudLightning, Wind, X, Flower2,
  Clock, Calendar as CalendarIcon, 
  CloudSnow, CloudDrizzle, Loader2, RefreshCw,
  CheckCircle2, Bell, Copy, Zap, Battery as BatteryIcon, 
  Car, UtilityPole, Info,
  Terminal, Sparkles, LayoutDashboard,
  Square, Trash2, Maximize, Minimize, ChevronUp, ChevronDown,
  Image as ImageIcon, ShieldAlert,
  Mic, MicOff, AlertTriangle, ExternalLink, LogOut, Globe,
  Music, SkipBack, Play, SkipForward, Pause, Volume2, Plus, Settings, Key,
  TrendingUp, Activity, History, Save,
  Recycle, Package, FileText, ChevronRight, Wine,
  Pizza, CookingPot, Utensils, Drumstick, Soup, Beef, ChefHat, Sandwich,
  Fish, Salad, Hamburger, Download, Upload
} from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { MusicWidget }        from './MusicWidget';
import { WeekAgendaWidget }   from './WeekAgendaWidget';
import { GooglePhotosWidget } from './GooglePhotosWidget';
import { PollenWidget }       from './PollenWidget';

// --- Constants & Types ---
const CLIENT_ID = '83368315587-g04nagjcgrsaotbdpet6gq2f7njrh2tu.apps.googleusercontent.com';
const SCOPES = 'openid profile email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const ENERGY_ENDPOINT = 'https://100.74.104.126:1881/evdata';
const SOLAR_FORECAST_ENDPOINT = 'https://100.74.104.126:1881/solardata';
const NODERED_BASE_URL = 'https://100.74.104.126:1881';
const NODERED_DASHBOARD = 'https://100.74.104.126:1881/dashboard/';
const VICTRON_VRM_URL = 'https://vrm.victronenergy.com/installation/756249/dashboard';

const WEATHER_CACHE_KEY = 'hub_weather_cache';
const PHOTOS_CACHE_KEY = 'hub_slideshow_photos';
const USER_CACHE_KEY = 'hub_user_profile_v3';

// IndexedDB configuration for photo storage
const DB_NAME = 'HubPhotosDB';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

// IndexedDB Helper Functions
const openPhotosDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('filename', 'filename', { unique: false });
      }
    };
  });
};

const savePhotoToIndexedDB = async (photo: any): Promise<void> => {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(photo);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getAllPhotosFromIndexedDB = async (): Promise<any[]> => {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const deletePhotoFromIndexedDB = async (id: string): Promise<void> => {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const clearAllPhotosFromIndexedDB = async (): Promise<void> => {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const GOOGLE_COLOR_MAP: Record<string, string> = {
  "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73", "5": "#f6bf26", 
  "6": "#f4511e", "7": "#039be5", "8": "#616161", "9": "#3f51b5", "10": "#0b8043", "11": "#d50000",
};

const FOOD_OPTIONS = [
  'Pizza', 'Friet', 'Taco', 'Wrap', 
  'Spaghetti', 'Spinazie Spek', 'Kip Rijst', 'Croque', 'Sushi','Visburger','Soep'
];

interface AgendaItem {
  id: string; 
  start: Date; 
  end: Date; 
  title: string; 
  location: string;
  category: 'word' | 'personal' | 'health' | 'social'; 
  color: string; 
  isAllDay: boolean; 
  htmlLink: string;
  allDayStartStr?: string; 
  allDayEndStr?: string;
  textColor?: string; 
  description?: string;
}

interface WeatherData {
  location: string; currentTemp: number; condition: string; humidity: number; windSpeed: string;
  hourly: { time: string; temp: number; icon: 'sun' | 'cloud' | 'rain' | 'storm' | 'snow' | 'drizzle' }[];
  daily: { day: string; low: number; high: number; condition: string; icon: 'sun' | 'cloud' | 'rain' | 'storm' | 'snow' | 'drizzle' }[];
}

interface SolarForecastItem {
  value: number | string;
  unit: string;
  date: string;
  description: string;
}

interface SolarDataResponse {
  solar: Record<string, SolarForecastItem>;
}

interface EnergyData {
  ev: {
    power: number;
    chargedToday: number;
    chargedMonth: number;
    totalCounter: number;
    startDay: string;
    startMonth: string;
    status: string;
  };
  solar: {
    total: number;
    ac: number;
    dc: number;
    dcTotalDay: number;
    acTotalDay: number;
    totalDay: number | string;
  };
  grid: {
    total: number;
    setpoint: number;
    acPower: number;
    dcPower: number;
  };
  battery: {
    soc: number;
    status: string;
    power: number;
  };
  forecast: {
    prediction: number;
    summary: string;
  };
  meta: {
    timestamp: string;
    system: string;
  };
}

interface LogEntry {
  timestamp: string;
  msg: string;
  type: 'info' | 'error' | 'success';
}

// --- Audio Helpers ---
function decode(base64: string) {
  const binaryString = atob(base64); const len = binaryString.length; const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}
function encode(bytes: Uint8Array) {
  let binary = ''; const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer); const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}
function createPCMUnit8Array(data: Float32Array): Uint8Array {
  const l = data.length; const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
  return new Uint8Array(int16.buffer);
}

const getWeatherInfo = (code: number): { icon: 'sun' | 'cloud' | 'rain' | 'storm' | 'snow' | 'drizzle'; text: string } => {
  if (code === 0) return { icon: 'sun', text: 'Zonnig' };
  if (code === 1) return { icon: 'sun', text: 'Helder' };
  if (code === 2) return { icon: 'cloud', text: 'Licht bewolkt' };
  if (code === 3) return { icon: 'cloud', text: 'Bewolkt' };
  if ([45, 48].includes(code)) return { icon: 'cloud', text: 'Mistig' };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: 'drizzle', text: 'Motregen' };
  if ([61, 63, 65, 66, 67].includes(code)) return { icon: 'rain', text: 'Regen' };
  if ([71, 73, 75, 77].includes(code)) return { icon: 'snow', text: 'Sneeuw' };
  if ([80, 81, 82].includes(code)) return { icon: 'rain', text: 'Regenbuien' };
  if ([85, 86].includes(code)) return { icon: 'snow', text: 'Sneeuwbuien' };
  if ([95, 96, 99].includes(code)) return { icon: 'storm', text: 'Onweer' };
  return { icon: 'cloud', text: 'Bewolkt' };
};

const VisualBattery = ({ soc, status, className }: { soc: number; status: string; className?: string }) => {
  const isCharging = status.toLowerCase() === 'opladen';
  const fillColor = isCharging ? 'bg-emerald-500' : 'bg-orange-500';
  const displaySoc = soc + '%';
  const barHeight = soc + '%';
  return (
    <div className={`relative w-40 h-64 border-4 border-gray-800 rounded-[1.5rem] p-1.5 flex items-end ${className}`}>
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-12 h-4 bg-gray-800 rounded-t-lg" />
      <div className={`w-full rounded-2xl transition-all duration-1000 ${fillColor}`} style={{ height: barHeight }} />
      <div className="absolute inset-0 flex items-center justify-center"><span className="text-4xl font-black text-gray-900 drop-shadow-sm">{displaySoc}</span></div>
    </div>
  );
};

const GeminiAssistantWidget = () => {
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const nextStartTimeRef = useRef(0);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const sessionActiveRef = useRef(false);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('nl-BE', { hour12: false });
    setLogs(prev => [...prev, { timestamp, msg, type }].slice(-100));
  };

  const stopSession = (reason?: string) => {
    addLog(`Sessie stoppen. Reden: ${reason || 'Geen opgegeven'}`, 'info');
    sessionActiveRef.current = false; setIsActive(false); setIsSpeaking(false); setIsStarting(false);
    if (reason && reason !== "Sessie gesloten.") {
      const isAuthError = reason.includes("API key not valid") || reason.includes("Requested entity was not found") || reason.includes("403") || reason.includes("401");
      if (isAuthError) { 
        addLog("Authenticatie fout gedetecteerd.", 'error'); 
        setNeedsKey(true); 
        setErrorMsg("API Key ongeldig of niet gekoppeld. Gebruik een key van een betaald project."); 
      }
      else { setErrorMsg(reason); }
    }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} }); sourcesRef.current.clear();
    if (scriptProcessorRef.current) { try { scriptProcessorRef.current.disconnect(); scriptProcessorRef.current.onaudioprocess = null; } catch (e) {} scriptProcessorRef.current = null; }
    if (sessionRef.current) { try { sessionRef.current.close(); } catch(e) {} sessionRef.current = null; }
    if (inputAudioContextRef.current) { try { inputAudioContextRef.current.close(); } catch(e) {} inputAudioContextRef.current = null; }
    if (outputAudioContextRef.current) { try { outputAudioContextRef.current.close(); } catch(e) {} outputAudioContextRef.current = null; }
  };

  const handleKeySetup = async () => {
    if ((window as any).aistudio) {
      addLog("Google AI Studio Key Selector openen...", 'info');
      await (window as any).aistudio.openSelectKey(); 
      setErrorMsg(null); 
      setNeedsKey(false);
      setShowSettings(false);
      addLog("Key geselecteerd. Startpoging in 500ms...", 'info');
      setTimeout(startSession, 500);
    }
  };

  const startSession = async () => {
    if (isActive || isStarting) return;
    setIsStarting(true); setErrorMsg(null); setNeedsKey(false);
    if ((window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey && !process.env.API_KEY) { 
        setNeedsKey(true); 
        setErrorMsg("Koppel een betaalde API Key om te starten."); 
        setIsStarting(false); 
        return; 
      }
    }
    try {
      addLog("Live sessie initialiseren...", 'info');
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (inCtx.state === 'suspended') await inCtx.resume();
      const outGain = outCtx.createGain(); outGain.connect(outCtx.destination);
      inputAudioContextRef.current = inCtx; outputAudioContextRef.current = outCtx;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            addLog("Live sessie verbonden met Google AI Cloud.", 'success');
            sessionActiveRef.current = true; setIsActive(true); setIsStarting(false);
            const source = inCtx.createMediaStreamSource(stream);
            const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBytes = createPCMUnit8Array(inputData);
              sessionPromise.then((session) => { 
                if (sessionActiveRef.current) {
                  session.sendRealtimeInput({ media: { data: encode(pcmBytes), mimeType: 'audio/pcm;rate=16000' } }); 
                }
              });
            };
            source.connect(scriptProcessor); scriptProcessor.connect(inCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const audioData = message.serverContent.modelTurn.parts[0].inlineData.data;
              if (outputAudioContextRef.current) {
                setIsSpeaking(true); nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                const buffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
                const source = outputAudioContextRef.current.createBufferSource();
                source.buffer = buffer; source.connect(outGain);
                source.addEventListener('ended', () => { sourcesRef.current.delete(source); if (sourcesRef.current.size === 0) setIsSpeaking(false); });
                source.start(nextStartTimeRef.current); nextStartTimeRef.current += buffer.duration; sourcesRef.current.add(source);
              }
            }
          },
          onclose: (e) => stopSession(e.reason || "Sessie gesloten."),
          onerror: (e: any) => stopSession(e?.message || "Socket fout")
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          systemInstruction: "Je bent Gemini Hub, een behulpzame assistent in Herenthout. Houd antwoorden kort en spreek Nederlands."
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) { stopSession(err.message || "Kon Live sessie niet starten."); }
  };

  return (
    <>
      <div className={`p-8 rounded-[2.5rem] shadow-sm border transition-all duration-500 overflow-hidden relative h-[200px] flex flex-col ${isActive ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100'}`}>
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowLogs(true)} className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2 hover:text-indigo-400 transition-colors">
              <span className={`w-2 h-2 rounded-full ${(isActive || isStarting) ? 'bg-indigo-500 animate-pulse' : 'bg-gray-300'}`} /> Gemini Hub Live
            </button>
            <button onClick={() => setShowSettings(true)} className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:text-indigo-500 transition-colors">
              <Settings size={14} />
            </button>
          </div>
          <button onClick={isActive ? () => stopSession() : startSession} disabled={isStarting} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${(isActive || isStarting) ? 'bg-indigo-500 text-white shadow-lg' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
            {isStarting ? <Loader2 size={20} className="animate-spin" /> : isActive ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        </div>
        <div className="flex-1 flex flex-col justify-center space-y-4">
          {errorMsg ? (
            <div className="py-2 text-center"><div className="flex flex-col items-center gap-3 text-rose-500 mb-6"><AlertTriangle size={32} /><p className="text-sm font-bold leading-tight max-w-xs">{errorMsg}</p></div>{needsKey && (<button onClick={() => setShowSettings(true)} className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl text-[11px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-colors shadow-sm">Instellingen openen</button>)}</div>
          ) : isActive ? (
            <div className="py-4 flex flex-col items-center"><div className="flex items-end gap-2 h-16 mb-8">{[1, 2, 3, 4, 5, 6, 7].map(i => (<div key={i} className={`w-1.5 bg-indigo-400 rounded-full transition-all duration-300 ${isSpeaking ? 'h-full animate-pulse' : 'h-3'}`} style={{animationDelay: `${i * 0.1}s`}} />))}</div><span className="text-sm font-black text-indigo-600 uppercase tracking-[0.3em]">{isSpeaking ? 'Hub spreekt...' : 'Hub luistert...'}</span></div>
          ) : isStarting ? ( <div className="flex flex-col items-center gap-4"><Loader2 size={40} className="text-indigo-400 animate-spin" /><p className="text-sm font-black text-indigo-400 uppercase tracking-widest animate-pulse">Initialiseren...</p></div> ) : (<div className="text-center space-y-6"><div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mx-auto text-gray-300"><Sparkles size={32} /></div><p className="text-sm font-bold text-gray-400 max-w-[200px] mx-auto leading-relaxed">Activeer de assistent for een live gesprek.</p></div>)}
        </div>
      </div>

      {showLogs && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center animate-in fade-in bg-black/80 backdrop-blur-md p-10">
          <div className="bg-[#1a1a1a] w-full max-w-4xl h-[80vh] rounded-[3rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl">
            <div className="p-8 bg-[#222] border-b border-white/5 flex justify-between items-center"><div className="flex items-center gap-4 text-indigo-400"><Terminal size={24} /><h3 className="font-black text-xs uppercase tracking-[0.4em]">Gemini Hub Live Console Logs</h3></div><div className="flex items-center gap-4"><button onClick={() => { const text = logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n'); navigator.clipboard.writeText(text); }} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all"><Copy size={18} /></button><button onClick={() => setLogs([])} className="p-3 bg-white/5 hover:bg-white/10 text-rose-400 rounded-xl transition-all"><Trash2 size={18} /></button><button onClick={() => setShowLogs(false)} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all"><X size={24} /></button></div></div>
            <div className="flex-1 overflow-y-auto p-8 space-y-2 font-mono text-[11px] scroll-smooth no-scrollbar">
              {logs.length === 0 ? ( <div className="h-full flex items-center justify-center opacity-20 text-white font-black uppercase tracking-widest">Geen logs beschikbaar</div> ) : logs.map((log, i) => ( <div key={i} className={`flex gap-4 border-b border-white/5 sleeper-b pb-2 last:border-0 ${log.type === 'error' ? 'text-rose-400' : log.type === 'success' ? 'text-emerald-400' : 'text-gray-400'}`}><span className="opacity-40 whitespace-nowrap">[{log.timestamp}]</span><span className="font-bold whitespace-nowrap">[{log.type.toUpperCase()}]</span><span className="text-white opacity-80 break-all">{log.msg}</span></div> ))}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center animate-in fade-in duration-300 bg-white/95 backdrop-blur-3xl p-10">
          <div className="bg-white w-full max-w-2xl p-16 rounded-[4rem] shadow-2xl border border-gray-100 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center mb-10">
              <Key size={40} />
            </div>
            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-widest mb-6">API Key Beheer</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-10 max-w-sm">
              Om de <strong>Live Voice</strong> assistent te gebruiken heb je een API-sleutel nodig van een Google Cloud-project met een gekoppelde betaalmethode.
            </p>
            
            <div className="w-full p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 text-left mb-12">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><Info size={12} /> Belangrijke Informatie</h4>
              <ul className="space-y-4">
                <li className="flex gap-4 items-start">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                  <p className="text-xs text-gray-600 font-medium leading-normal">
                    Schakel facturering in via de <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-600 font-bold hover:underline">Google AI Studio Billing Docs</a>.
                  </p>
                </li>
                <li className="flex gap-4 items-start">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                  <p className="text-xs text-gray-600 font-medium leading-normal">
                    Gebruik een sleutel uit een project binnen je <strong>betaalde organisatie</strong>. Gratis keys werken niet voor Live Voice.
                  </p>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-4 w-full">
              <button onClick={handleKeySetup} className="w-full py-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2rem] font-black text-lg uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-4">
                <Plus size={20} /> Sleutel Selecteren / Updaten
              </button>
              <button onClick={() => setShowSettings(false)} className="w-full py-6 text-gray-400 hover:text-gray-900 text-xs font-black uppercase tracking-widest transition-colors">
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const TimerWidget = () => {
  const [timeLeft, setTimeLeft] = useState(0); const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'finished'>('idle');
  const [showOther, setShowOther] = useState(false); const [selectedMins, setSelectedMins] = useState(0); const [selectedSecs, setSelectedSecs] = useState(0);
  const timerRef = useRef<number | null>(null); const audioContextRef = useRef<AudioContext | null>(null); const alarmIntervalRef = useRef<number | null>(null);
  const formatTime = (seconds: number) => { const mins = Math.floor(seconds / 60); const secs = seconds % 60; return `${mins}:${secs.toString().padStart(2, '0')}`; };
  const playAlarm = () => {
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContextRef.current; if (ctx.state === 'suspended') ctx.resume();
    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.3, start + 0.05); gain.gain.linearRampToValueAtTime(0, start + duration);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(start); osc.stop(start + duration);
    };
    const now = ctx.currentTime; for (let i = 0; i < 3; i++) beep(880, now + i * 0.3, 0.15);
  };
  const startTimer = (seconds: number) => { setTimeLeft(seconds); setIsRunning(true); setStatus('running'); setShowOther(false); if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current); };
  const stopTimer = () => { setIsRunning(false); setStatus('idle'); setTimeLeft(0); if (timerRef.current) clearInterval(timerRef.current); if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current); };
  useEffect(() => {
    if (isRunning && timeLeft > 0) timerRef.current = window.setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    else if (timeLeft === 0 && isRunning) { setIsRunning(false); setStatus('finished'); playAlarm(); alarmIntervalRef.current = window.setInterval(playAlarm, 2000); }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning, timeLeft]);

  const RollingPicker = ({ max, value, onChange, label }: { max: number, value: number, onChange: (val: number) => void, label: string }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const itemHeight = 120;
    const items = useMemo(() => Array.from({ length: max + 1 }, (_, i) => i), [max]);

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = value * itemHeight;
      }
    }, [max]);

    const handleScroll = () => {
      if (!scrollRef.current) return;
      const index = Math.round(scrollRef.current.scrollTop / itemHeight);
      if (items[index] !== undefined && items[index] !== value) {
        onChange(items[index]);
      }
    };

    return (
      <div className="flex flex-col items-center flex-1 select-none">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">{label}</span>
        <div className="relative h-[360px] w-full flex items-center justify-center overflow-hidden">
           <div className="absolute top-1/2 left-0 right-0 h-[120px] -translate-y-1/2 border-y-2 border-indigo-100 bg-indigo-50/20 -z-10 pointer-events-none rounded-[2rem]" />
           <div 
             ref={scrollRef} 
             onScroll={handleScroll} 
             className="w-full h-full overflow-y-auto no-scrollbar snap-y snap-mandatory py-[120px] touch-pan-y" 
             style={{ perspective: '1200px' }}
           >
             {items.map(i => (
               <div 
                 key={i} 
                 className="h-[120px] flex items-center justify-center snap-center transition-all duration-300 pointer-events-none" 
                 style={{ 
                   opacity: Math.max(0.1, 1 - Math.abs(value-i)*0.4), 
                   transform: `scale(${Math.max(0.7, 1.25-Math.abs(value-i)*0.2)}) rotateX(${(i-value)*18}deg)`, 
                   transformOrigin: 'center center', 
                   backfaceVisibility: 'hidden' 
                 }}
               >
                 <span className="text-[96px] tabular-nums tracking-tighter font-black text-gray-900 drop-shadow-sm">{i.toString().padStart(2, '0')}</span>
               </div>
             ))}
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 transition-all duration-500 overflow-hidden ${status !== 'idle' ? 'flex-1' : ''}`}>
      <div className="flex justify-between items-center mb-6"><span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2"><Clock size={10} className="text-indigo-400" /> Timer</span></div>
      {status === 'idle' ? (
        <div className="grid grid-cols-3 gap-3">{[5, 10, 15, 30, 45].map(m => ( <button key={m} onClick={() => startTimer(m * 60)} className="py-4 bg-gray-50 hover:bg-indigo-50 text-gray-700 hover:text-indigo-600 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 border border-transparent hover:border-indigo-100">{m + ':00'}</button> ))} <button onClick={() => setShowOther(true)} className="py-4 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95">ANDER</button> </div>
      ) : status === 'running' ? (
        <div className="flex flex-col items-center justify-center py-6 animate-in fade-in"><div className="text-7xl font-black text-gray-900 tabular-nums tracking-tighter mb-8">{formatTime(timeLeft)}</div><button onClick={stopTimer} className="w-16 h-16 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-full flex items-center justify-center transition-all active:scale-90 border border-rose-100 shadow-sm"><Square size={24} fill="currentColor" /></button></div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 animate-in zoom-in-95 duration-500"><div className="text-2xl font-black text-rose-500 uppercase tracking-[0.3em] mb-12 flex items-center gap-4"><Bell className="animate-bounce" /> Timer voltooid! <Bell className="animate-bounce" /></div><button onClick={stopTimer} className="w-full py-16 bg-rose-500 hover:bg-rose-600 text-white rounded-[3rem] font-black text-5xl uppercase tracking-[0.4em] transition-all active:scale-95 shadow-2xl shadow-rose-200">Stop</button></div>
      )}
      {showOther && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center animate-in fade-in duration-300 bg-white/95 backdrop-blur-3xl p-10">
          <div className="bg-white w-full max-w-2xl p-16 rounded-[4rem] shadow-2xl border border-gray-100 flex flex-col">
            <div className="flex justify-between items-center w-full mb-16"><h3 className="text-2xl font-black text-gray-900 uppercase tracking-widest">Kies Tijd</h3><button onClick={() => setShowOther(false)} className="w-16 h-16 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"><X size={32} /></button></div>
            <div className="flex items-center gap-12 mb-20 px-8"><RollingPicker max={99} value={selectedMins} onChange={setSelectedMins} label="Minuten" /><div className="text-5xl font-black text-gray-200 pt-10">:</div><RollingPicker max={59} value={selectedSecs} onChange={setSelectedSecs} label="Seconden" /></div>
            <button onClick={() => startTimer(selectedMins * 60 + selectedSecs)} className="w-full py-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2.5rem] font-black text-2xl uppercase tracking-[0.4em] shadow-xl shadow-indigo-100 transition-all active:scale-95">Start Timer</button>
          </div>
        </div>
      )}
    </div>
  );
};

const EnergyOverlay = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-white animate-in fade-in duration-300">
      <div className="p-6 flex justify-between items-center bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm border border-emerald-100">
            <Zap size={24} fill="currentColor" />
          </div>
          <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">Energie Dashboard</h3>
        </div>
        <button 
          onClick={onClose} 
          className="w-14 h-14 flex items-center justify-center bg-gray-900 text-white rounded-[1.5rem] hover:bg-black transition-all shadow-xl active:scale-90"
        >
          <X size={28} />
        </button>
      </div>
      <div className="flex-1 w-full bg-[#f0f0f0] overflow-hidden relative">
        <iframe 
          src={NODERED_DASHBOARD} 
          className="w-full h-full border-none" 
          title="Node-RED Dashboard"
        />
      </div>
    </div>
  );
};

const WeatherIcon = ({ type, className }: { type: string, className?: string }) => {
  switch (type.toLowerCase()) {
    case 'sun': return <Sun className={className} />; case 'cloud': return <Cloud className={className} />; case 'rain': return <CloudRain className={className} />; case 'storm': return <CloudLightning className={className} />; case 'snow': return <CloudSnow className={className} />; case 'drizzle': return <CloudDrizzle className={className} />; default: return <Cloud className={className} />;
  }
};

const WeatherWidget = ({ data, onClick, isRefreshing }: { data: WeatherData | null, onClick: () => void, isRefreshing: boolean }) => (
  <button onClick={onClick} className="flex items-center gap-6 px-8 py-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:border-blue-400 hover:shadow-xl transition-all group active:scale-95 text-left">
    <div className="flex flex-col items-end"><span className="text-xl font-black text-gray-900 leading-none">{data ? data.currentTemp + '°C' : '--°C'}</span>{data && (<div className="flex items-center gap-1.5 mt-1.5"><Wind size={10} className="text-blue-300" /><span className="text-[9px] text-gray-400 uppercase tracking-widest font-black">{data.windSpeed}</span></div>)}<span className="text-[8px] text-gray-300 uppercase tracking-[0.2em] font-black mt-1">Herenthout</span></div>
    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">{isRefreshing ? (<RefreshCw className="w-6 h-6 text-blue-300 animate-spin" />) : (<WeatherIcon type={data?.hourly[0]?.icon || 'cloud'} className="w-7 h-7 text-blue-400 group-hover:scale-110 transition-transform" />)}</div>
  </button>
);

const WeatherOverlay = ({ onClose, weatherData, loading }: any) => {
  return (
    <div className="absolute inset-0 z-[250] flex items-center justify-center animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-[100px]" onClick={onClose} />
      <div className="relative w-full h-full bg-white/40 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-10 flex justify-between items-center bg-white/20 backdrop-blur-xl shrink-0 border-b border-white/40">
          <div className="flex items-center gap-8">
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-lg border border-gray-100">
              <Cloud size={32} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-4xl font-black text-gray-900 tracking-tight">Weersverwachting</h3>
              <div className="flex items-center gap-3 mt-1"><span className="text-xs text-gray-400 font-black uppercase tracking-[0.3em]">Herenthout, BE</span></div>
            </div>
          </div>
          <button onClick={onClose} className="w-20 h-20 flex items-center justify-center bg-gray-900 hover:bg-black rounded-[2.5rem] transition-all text-white shadow-2xl group active:scale-90">
            <X className="w-10 h-10 group-hover:rotate-90 transition-transform" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-12 space-y-24 no-scrollbar scroll-smooth pb-32">
          {loading && !weatherData ? ( 
            <div className="flex flex-col items-center justify-center py-48 gap-8">
              <Loader2 className="w-24 h-24 text-blue-400 animate-spin" />
            </div> 
          ) : weatherData && ( 
            <div className="space-y-24 animate-in slide-in-from-bottom-8">
              <section className="space-y-12">
                <div className="flex items-center gap-4 px-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span className="text-lg text-gray-900 font-black uppercase tracking-[0.4em]">Komende uren</span>
                </div>
                <div className="flex gap-6 overflow-x-auto pb-8 no-scrollbar snap-x px-2">
                  {weatherData.hourly.map((h: any, i: number) => ( 
                    <div key={i} className="flex-shrink-0 w-44 bg-white/80 border border-white/50 p-12 rounded-[3rem] flex flex-col items-center gap-8 hover:bg-white hover:shadow-2xl transition-all snap-start group">
                      <span className="text-[14px] text-gray-400 font-black uppercase tracking-widest">{h.time}</span>
                      <WeatherIcon type={h.icon} className="w-16 h-16 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="text-4xl font-light text-gray-900 tracking-tighter">{h.temp + '°'}</span>
                    </div> 
                  ))}
                </div>
              </section>
              <section className="space-y-12">
                <div className="flex items-center gap-4 px-2">
                  <div className="w-2 h-2 bg-gray-300 rounded-full" />
                  <span className="text-lg text-gray-900 font-black uppercase tracking-[0.4em]">7-Daagse</span>
                </div>
                <div className="flex gap-6 overflow-x-auto pb-8 no-scrollbar snap-x px-2">
                  {weatherData.daily.map((d: any, i: number) => ( 
                    <div key={i} className="flex-shrink-0 w-52 bg-white/80 border border-white/50 p-10 rounded-[3.5rem] flex flex-col items-center gap-6 hover:bg-white hover:shadow-2xl transition-all snap-start group">
                      <span className="text-[14px] text-gray-400 font-black uppercase tracking-widest">{d.day}</span>
                      <WeatherIcon type={d.icon} className="w-16 h-16 text-blue-400 group-hover:scale-110 transition-transform" />
                      <div className="text-center">
                        <div className="text-4xl font-black text-gray-900">{d.high + '°'}</div>
                        <div className="text-xl font-bold text-gray-300 mt-1">{d.low + '°'}</div>
                      </div>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">{d.condition}</span>
                    </div> 
                  ))}
                </div>
              </section>
            </div> 
          )}
        </div>
      </div>
    </div>
  );
};




  const EnergyWidget = ({ data, error, onTitleClick, onWidgetClick, apiUrl }: { data: EnergyData | null, error: string | null, onTitleClick: () => void, onWidgetClick: () => void, apiUrl: string }) => {
  const isEvCharging = data && data.ev.power > 100;
  const isDcLoading = data && data.grid.dcPower > 100;
  const batteryStatus = data ? data.battery.status : '';
  const batteryIconColor = batteryStatus.toLowerCase() === 'opladen' ? "text-emerald-500" : 
                          batteryStatus.toLowerCase() === 'ontladen' ? "text-rose-500" : "text-gray-400";
  
  return (
    <div 
      onClick={onWidgetClick}
      className="w-full p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 text-left hover:border-emerald-400 hover:shadow-xl transition-all overflow-hidden relative group cursor-pointer"
    >
      <div className="flex justify-between items-center mb-6">
        <button 
          onClick={(e) => { e.stopPropagation(); onTitleClick(); }} 
          className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2 hover:text-emerald-500 transition-colors"
        >
          <Zap size={10} className="text-emerald-500" /> Energie Status <FileText size={10} className="opacity-40" />
        </button>
        {error ? (
          <a 
            onClick={(e) => e.stopPropagation()}
            href={apiUrl} 
            target="_blank" 
            rel="noreferrer" 
            className="text-[9px] font-black text-rose-500 uppercase flex items-center gap-1 hover:underline animate-pulse"
          >
            <AlertTriangle size={10}/> {error} <ExternalLink size={8} />
          </a>
        ) : (
          <span className="text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1">
            <CheckCircle2 size={10}/> LIVE
          </span>
        )}
      </div>
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Huis Verbruik</p>
            <div className="flex items-baseline gap-2">
              <p className="text-7xl font-black text-gray-900 leading-none tracking-tighter tabular-nums">{data ? data.grid.acPower : '---'}</p>
              <span className="text-2xl font-bold text-gray-300">W</span>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <UtilityPole size={16} className="text-blue-500" />
              <span className="text-sm font-black text-gray-900 uppercase tracking-widest">Net: {data ? data.grid.total + 'W' : '--W'}</span>
            </div>
          </div>
          <div className="space-y-5 sleeper-l border-gray-100 pl-4 border-l">
            <div className="flex items-center gap-4">
              <Sun size={24} className="text-amber-400" />
              <span className="text-2xl font-black text-gray-800 tabular-nums">{data ? data.solar.total + 'W' : '--W'}</span>
            </div>
            <div className="flex items-center gap-4">
              <BatteryIcon size={24} className={batteryIconColor} />
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-gray-800 tabular-nums">{data ? data.battery.power + 'W' : '--W'}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isDcLoading ? (
                <>
                  <Zap size={24} className="text-emerald-500" />
                  <span className="text-2xl font-black text-gray-800 tabular-nums">{data?.grid.dcPower}W</span>
                </>
              ) : isEvCharging ? (
                <>
                  <Car size={24} className="text-blue-500" />
                  <span className="text-2xl font-black text-gray-800 tabular-nums">{data?.ev.power}W</span>
                </>
              ) : (
                <>
                  <Car size={24} className="text-gray-400" />
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Idle</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-gray-50 pt-8">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Batterij</span>
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-5 border-2 border-emerald-400 rounded-[2px] relative flex items-end">
                <div className="w-full bg-emerald-400" style={{ height: (data?.battery.soc || 0) + '%' }} />
              </div>
              <span className="text-2xl font-black text-gray-900 tabular-nums">{data ? data.battery.soc + '%' : '--%'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 items-center text-center">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Zon Opbrengst</span>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-black tabular-nums text-gray-900">{data ? data.solar.totalDay : '--'}</span>
              <span className="text-[10px] font-bold text-gray-300">kWh</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-right items-end">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Zon Forecast</span>
            <div className="flex items-center justify-end gap-2">
              <span className={'text-2xl font-black tabular-nums text-gray-900'}>{data ? data.forecast.prediction.toFixed(2)  : '--'}</span>
              <span className="text-[10px] font-bold text-gray-300">kWh</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('hub_access_token'));
  const [grantedScopes, setGrantedScopes] = useState<string>(localStorage.getItem('hub_granted_scopes') || "");
  const [user, setUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [isAgendaCollapsed, setIsAgendaCollapsed] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [isWeatherOpen, setIsWeatherOpen] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(() => { const cached = localStorage.getItem(WEATHER_CACHE_KEY); return cached ? JSON.parse(cached) : null; });
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [isEnergyOpen, setIsEnergyOpen] = useState(false);
  const [energyData, setEnergyData] = useState<EnergyData | null>(null);
  const [solarForecastData, setSolarForecastData] = useState<SolarDataResponse | null>(null);
  const [energyError, setEnergyError] = useState<string | null>(null);
  const [energyLogs, setEnergyLogs] = useState<LogEntry[]>([]);
  const [showEnergyLogs, setShowEnergyLogs] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const tokenClientRef = useRef<any>(null);
  const [showPollen, setShowPollen] = useState(false);

  const handleLogout = () => { 
    localStorage.removeItem('hub_access_token'); 
    localStorage.removeItem('hub_granted_scopes');
    localStorage.removeItem(USER_CACHE_KEY); 
    setAccessToken(null); 
    setGrantedScopes("");
    setUser(null); 
    setAgendaItems([]); 
    setSpotifyConfig(null);
  };
  
  const handleLogin = (isReAuth = false) => { 
    setIsSyncing(true); 
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ 
        prompt: isReAuth ? 'select_account consent' : ''
      }); 
    } 
  };

  const toggleFullScreen = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };

  const addEnergyLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('nl-BE', { hour12: false });
    setEnergyLogs(prev => [{ timestamp, msg, type }, ...prev].slice(0, 100));
  };

  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentDate(new Date()), 1000);
    const fullscreenHandler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fullscreenHandler);
    const initGsi = () => {
      if ((window as any).google) {
        tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID, 
          scope: SCOPES,
          callback: async (response: any) => {
            if (response.access_token) { 
               setAccessToken(response.access_token); 
               setGrantedScopes(response.scope || "");
               localStorage.setItem('hub_access_token', response.access_token); 
               localStorage.setItem('hub_granted_scopes', response.scope || "");
               await refreshAllUserData(response.access_token);
            }
            setIsSyncing(false);
          },
        });
        if (accessToken) { 
          refreshAllUserData(accessToken).catch(() => handleLogout()); 
        }
      } else { setTimeout(initGsi, 500); }
    };
    initGsi(); 
    const energyTimer = startEnergySync(); 
    if (!weatherData) fetchWeatherForecast(false);
    return () => { 
      clearInterval(clockTimer); 
      clearInterval(energyTimer);
      document.removeEventListener('fullscreenchange', fullscreenHandler); 
    };
  }, []);

  const refreshAllUserData = async (token: string) => {
    await fetchUserProfile(token);
    await fetchCalendarEvents(token);
  };

  const fetchUserProfile = async (token: string) => { 
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } }); if (resp.status === 401) { handleLogout(); return; }
    const data = await resp.json(); setUser({ name: data.name, picture: data.picture }); 
  };
  
  const fetchCalendarEvents = async (token: string) => { 
    setAgendaLoading(true); 
    try { 
      const now = new Date(); const start = new Date(now); start.setHours(0,0,0,0); const end = new Date(now); end.setDate(now.getDate() + 100); 
      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + start.toISOString() + '&timeMax=' + end.toISOString() + '&singleEvents=true&orderBy=startTime', { headers: { Authorization: 'Bearer ' + token } });
      const data = await resp.json(); 
      if (data.items) { 
        const mapped = data.items.map((event: any) => { 
          const isAllDay = !event.start.dateTime; 
          const startRaw = event.start.dateTime || event.start.date; 
          const endRaw = event.end.dateTime || event.end.date;
          const startDate = isAllDay ? new Date(startRaw + 'T00:00:00') : new Date(startRaw);
          const endDate = isAllDay ? new Date(endRaw + 'T00:00:00') : new Date(endRaw);
          
          let displayTitle = event.summary || '(Geen titel)';
          let displayDescription = event.description || '';
          
          if (!isAllDay) {
            displayTitle = displayTitle
              .replace(/\s*\d{1,2}[u:]\d{0,2}\s*-\s*\d{1,2}[u:]\d{0,2}/gi, '')
              .replace(/\s*\d{1,2}[u:]\d{2}/gi, '')
              .replace(/\s*\d{1,2}\s*u/gi, '')
              .trim();
          }

          const nameRules = [
            { name: 'Joosefien', color: '#E57C73' },
            { name: 'Viktor', color: '#10B981' },
            { name: 'Papa', color: '#F4511E' },
            { name: 'Mama', color: '#660066' }
          ];

          // Zoek alle unieke namen uit de regels die voorkomen in de titel
          const foundNamesInTitle = nameRules.filter(rule => 
            displayTitle.toLowerCase().includes(rule.name.toLowerCase())
          );

          let finalTitle = displayTitle;
          let finalDescription = displayDescription;
          let textColor = undefined;

          // Pas alleen aan als er precies één naamtype gevonden is
          if (foundNamesInTitle.length === 1) {
            const rule = foundNamesInTitle[0];
            textColor = rule.color;
            
            // Gebruik regex met word boundaries (\b) om exact de naam te matchen
            // We gebruiken een case-insensitive match (i)
            const regex = new RegExp(`\\b${rule.name}\\b`, 'gi');
            
            finalTitle = finalTitle.replace(regex, '').trim().replace(/\s+/g, ' ');
            finalDescription = finalDescription.replace(regex, '').trim().replace(/\s+/g, ' ');
          }

          return { 
            id: event.id, 
            start: startDate, 
            end: endDate, 
            title: finalTitle || '(Geen titel)', 
            color: GOOGLE_COLOR_MAP[event.colorId] || '#10b981', 
            isAllDay, 
            htmlLink: event.htmlLink,
            allDayStartStr: isAllDay ? startRaw : undefined,
            allDayEndStr: isAllDay ? endRaw : undefined,
            textColor: textColor,
            description: finalDescription
          }; 
        }); 
        setAgendaItems(mapped); 
      }
    } catch (e) { console.error(e); } finally { setAgendaLoading(false); } 
  };

  async function fetchWeatherForecast(triggerOverlay = true) { 
    if (triggerOverlay) setIsWeatherOpen(true); setWeatherLoading(true); try { 
      const resp = await fetch('https://api.open-meteo.com/v1/forecast?latitude=51.1378&longitude=4.7570&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto'); 
      const data = await resp.json(); const now = new Date(); const nextHourIndex = data.hourly.time.findIndex((t: string) => new Date(t) > now); 
      const newWeatherData = { location: "Herenthout", currentTemp: Math.round(data.current.temperature_2m), condition: getWeatherInfo(data.current.weather_code).text, humidity: data.current.relative_humidity_2m, windSpeed: Math.round(data.current.wind_speed_10m) + ' km/u', hourly: data.hourly.time.slice(nextHourIndex, nextHourIndex + 12).map((t: string, i: number) => ({ time: new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }), temp: Math.round(data.hourly.temperature_2m[nextHourIndex + i]), icon: getWeatherInfo(data.hourly.weather_code[nextHourIndex + i]).icon })), daily: data.daily.time.slice(0, 7).map((t: string, i: number) => { const info = getWeatherInfo(data.daily.weather_code[i]); return { day: ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'][new Date(t).getDay()], low: Math.round(data.daily.temperature_2m_min[i]), high: Math.round(data.daily.temperature_2m_max[i]), condition: info.text, icon: info.icon }; }) };
      setWeatherData(newWeatherData);
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(newWeatherData));
    } catch (e) { console.error(e); } finally { setWeatherLoading(false); } 
  }
  
  const startEnergySync = () => { 
    return setInterval(async () => { 
      try { 
        // Concurrent fetches for performance
        const [energyResp, solarForecastResp] = await Promise.all([
          fetch(ENERGY_ENDPOINT),
          fetch(SOLAR_FORECAST_ENDPOINT)
        ]);

        if (!energyResp.ok) throw new Error(`Energy Status: ${energyResp.status}`);
        const energyRaw = await energyResp.json(); 
        
        setEnergyData({ 
          ev: {
            power: energyRaw.ev.current_power.value,
            chargedToday: energyRaw.ev.charged_today.value,
            chargedMonth: energyRaw.ev.charged_month.value,
            totalCounter: energyRaw.ev.total_counter.value,
            startDay: energyRaw.ev.start_day.value,
            startMonth: energyRaw.ev.start_month.value,
            status: energyRaw.ev.status.value
          },
          solar: {
            total: energyRaw.solar.total_power.value,
            ac: energyRaw.solar.ac_pv_power.value,
            dc: energyRaw.solar.dc_pv_power.value,
            dcTotalDay: energyRaw.solar.dc_pv_total.value,
            acTotalDay: energyRaw.solar.ac_pv_totalday.value,
            totalDay: energyRaw.solar.total_powerday.value
          },
          grid: {
            total: energyRaw.grid.total_power.value,
            setpoint: energyRaw.grid.setpoint.value,
            acPower: energyRaw.grid.ac_power.value,
            dcPower: energyRaw.grid.dc_power.value
          },
          battery: {
            soc: energyRaw.battery.soc.value,
            status: energyRaw.battery.status.value,
            power: energyRaw.battery.power.value
          },
          forecast: {
            prediction: parseFloat(energyRaw.forecast.prediction.value),
            summary: energyRaw.forecast.summary.value
          },
          meta: {
            timestamp: energyRaw.meta.timestamp,
            system: energyRaw.meta.system
          }
        }); 

        if (solarForecastResp.ok) {
          const solarRaw = await solarForecastResp.json();
          setSolarForecastData(solarRaw);
        }

        setEnergyError(null); 
        addEnergyLog("Data succesvol opgehaald", "success");
      } catch (e: any) { 
        setEnergyError("Verbindingsfout"); 
        addEnergyLog("Fetch fout: " + e.message, "error");
      } 
    }, 2000); 
  };

  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col animate-in fade-in">
      <header className="w-full px-[50px] pt-6 pb-2 flex flex-col md:flex-row md:items-center justify-between shrink-0 relative">
        {/* Left Section: Greeting + Date */}
        <div className="flex flex-col gap-1.5 z-10 md:w-1/3">
          <h1 className="text-4xl sm:text-6xl font-extralight tracking-tighter text-gray-300 leading-none">
            {currentDate.getHours() < 12 ? 'Goedemorgen' : currentDate.getHours() < 18 ? 'Goedemiddag' : 'Goedenavond'}
          </h1>
          <div className="flex items-center gap-4 px-1">
            <CalendarIcon className="w-5 h-5 text-gray-200" />
            <p className="text-gray-400 text-xs uppercase tracking-[0.4em] font-black">
              {currentDate.toLocaleDateString('nl-BE', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Center Section: Clock */}
        <div className="md:absolute md:left-1/2 md:-translate-x-1/2 text-[7rem] sm:text-[9rem] font-black tracking-tighter text-gray-900 leading-none tabular-nums py-4 md:py-0">
          {currentDate.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
        </div>

        {/* Right Section: Actions */}
        <div className="md:w-1/3 flex items-center justify-end gap-10 z-10">
          <div className="flex items-center gap-8">
            {accessToken && (
				  <button 
					onClick={() => setShowPhotos(!showPhotos)} 
					className={'w-16 h-16 border rounded-[2rem] shadow-xl flex items-center justify-center transition-all ' + (showPhotos ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-gray-100 text-gray-400 hover:text-gray-900')}
				  >
					<ImageIcon size={24} />
				  </button>
				)} 
			<button onClick={toggleFullScreen} className="w-16 h-16 bg-white border border-gray-100 rounded-[2rem] shadow-xl flex items-center justify-center text-gray-400 hover:text-gray-900">{isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}</button>
            {!accessToken ? (<button onClick={() => handleLogin()} disabled={isSyncing} className="px-12 py-6 bg-gray-900 text-white rounded-[2.5rem] text-[13px] font-black uppercase tracking-widest shadow-2xl">Google Sync</button>) : ( <div className="flex items-center gap-8 bg-white p-4 pr-10 rounded-[2.5rem] border border-gray-100 shadow-xl cursor-pointer" onClick={handleLogout}><div className="w-16 h-16 bg-gray-100 rounded-3xl overflow-hidden border border-gray-50"><img src={user?.picture} alt="" className="w-full h-full object-cover" /></div><div className="text-right"><div className="text-[13px] font-black text-gray-900 uppercase tracking-widest">{user?.name}</div><div className="text-[10px] text-green-500 font-bold flex items-center justify-end gap-2 mt-1"><CheckCircle2 size={12}/> ONLINE</div></div></div> )}
            <WeatherWidget data={weatherData} onClick={() => fetchWeatherForecast(true)} isRefreshing={weatherLoading} />
			<button 
			  onClick={() => setShowPollen(!showPollen)} 
			  className={'w-16 h-16 border rounded-[2rem] shadow-xl flex items-center justify-center transition-all ' + (showPollen ? 'bg-green-600 border-green-500 text-white' : 'bg-white border-gray-100 text-gray-400 hover:text-gray-900')}
			  title="Stuifmeel voorspelling"
			>
			  <Flower2 size={24} />
			</button>
		  </div>
        </div>
      </header>
		<main className="w-full px-[50px] pt-3 pb-4 grid grid-cols-1 xl:grid-cols-10 gap-10 flex-1 overflow-hidden">
		<section className="xl:col-span-7 flex flex-col gap-10">
		  {/* Pollen Widget - Shows above everything when toggled on */}
		  {showPollen && (
			<PollenWidget onClose={() => setShowPollen(false)} />
		  )}
		  
		  {/* Google Photos Widget - Shows above agenda when toggled on */}
		  {accessToken && showPhotos && (
			<GooglePhotosWidget 
			  accessToken={accessToken} 
			  onForceLogout={handleLogout} 
			/>
		  )}
		  
		  {/* Week Agenda Widget - Always visible, always 1180px high */}
		  <WeekAgendaWidget 
			accessToken={accessToken} 
			items={agendaItems} 
			isLoading={agendaLoading} 
			solarData={solarForecastData}
			onRefresh={() => accessToken && fetchCalendarEvents(accessToken)} 
			isCollapsed={isAgendaCollapsed} 
			onToggleCollapse={() => setIsAgendaCollapsed(!isAgendaCollapsed)} 
		  />
		</section>	  
		  <aside className="xl:col-span-3 space-y-10 flex flex-col">
			<EnergyWidget data={energyData} error={energyError} onTitleClick={() => setShowEnergyLogs(true)} onWidgetClick={() => setIsEnergyOpen(true)} apiUrl={ENERGY_ENDPOINT} />
			<MusicWidget nodeRedBaseUrl={NODERED_BASE_URL} />
			<TimerWidget />
			<GeminiAssistantWidget />
		  </aside>
		</main>
      {/* Energy Logs Overlay */}
      {showEnergyLogs && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center animate-in fade-in bg-black/80 backdrop-blur-md p-10">
          <div className="bg-[#1a1a1a] w-full max-w-4xl h-[80vh] rounded-[3rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl">
            <div className="p-8 bg-[#222] border-b border-white/5 flex justify-between items-center"><div className="flex items-center gap-4 text-emerald-400"><Zap size={24} /><h3 className="font-black text-xs uppercase tracking-[0.4em]">Energy System Logs</h3></div><div className="flex items-center gap-4"><button onClick={() => { const text = energyLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n'); navigator.clipboard.writeText(text); }} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all"><Copy size={18} /></button><button onClick={() => setEnergyLogs([])} className="p-3 bg-white/5 hover:bg-white/10 text-rose-400 rounded-xl transition-all"><Trash2 size={18} /></button><button onClick={() => setShowEnergyLogs(false)} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all"><X size={24} /></button></div></div>
            <div className="p-4 bg-emerald-500/5 border-b border-white/5 flex items-center justify-between px-8">
               <span className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-widest">End-point: {ENERGY_ENDPOINT}</span>
               <a href={ENERGY_ENDPOINT} target="_blank" rel="noreferrer" className="text-[10px] font-black text-emerald-400 uppercase tracking-widest hover:underline flex items-center gap-2">Test URL <ExternalLink size={10} /></a>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-2 font-mono text-[11px] scroll-smooth no-scrollbar">
              {energyLogs.length === 0 ? ( 
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-white font-black uppercase tracking-[0.3em] gap-4">
                  <Activity size={48} className="animate-pulse" />
                  Wachten op data...
                </div> 
              ) : energyLogs.map((log, i) => ( 
                <div key={i} className={`flex gap-4 border-b border-white/5 pb-2 last:border-0 ${log.type === 'error' ? 'text-rose-400' : log.type === 'success' ? 'text-emerald-400' : 'text-gray-400'}`}>
                  <span className="opacity-40 whitespace-nowrap">[{log.timestamp}]</span>
                  <span className="font-bold whitespace-nowrap uppercase">[{log.type}]</span>
                  <span className="text-white opacity-80 break-all">{log.msg}</span>
                </div> 
              ))}
            </div>
          </div>
        </div>
      )}

      {isWeatherOpen && <WeatherOverlay onClose={() => setIsWeatherOpen(false)} weatherData={weatherData} loading={weatherLoading} />}
      {isEnergyOpen && <EnergyOverlay onClose={() => setIsEnergyOpen(false)} />}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);