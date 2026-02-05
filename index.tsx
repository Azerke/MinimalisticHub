import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Cloud, Sun, CloudRain, CloudLightning, Wind, X, 
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

// --- Constants & Types ---
const CLIENT_ID = '83368315587-g04nagjcgrsaotbdpet6gq2f7njrh2tu.apps.googleusercontent.com';
const SCOPES = 'openid profile email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const ENERGY_ENDPOINT = 'https://100.74.104.126:1881/evdata';
const SOLAR_FORECAST_ENDPOINT = 'https://100.74.104.126:1881/solardata';
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

interface SpotifyConfig {
  username: string;
  password_b64: string;
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

const GooglePhotosWidget = ({ accessToken, onForceLogout }: { accessToken: string | null, onForceLogout: () => void }) => {
  const [photos, setPhotos] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [showPhotosLog, setShowPhotosLog] = useState(false);
  const [photosLogs, setPhotosLogs] = useState<LogEntry[]>([]);
  const hasHydratedRef = useRef(false);
  const hasLoadedFromDBRef = useRef(false);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('nl-BE', { hour12: false });
    setPhotosLogs(prev => [...prev, { timestamp, msg, type }].slice(-100));
  };

  // Load photos from IndexedDB on mount
  useEffect(() => {
    const loadPhotosFromDB = async () => {
      if (hasLoadedFromDBRef.current) return;
      hasLoadedFromDBRef.current = true;
      
      try {
        const storedPhotos = await getAllPhotosFromIndexedDB();
        if (storedPhotos.length > 0) {
          addLog(`${storedPhotos.length} foto's geladen uit IndexedDB`, 'success');
          setPhotos(storedPhotos);
        }
      } catch (e: any) {
        addLog(`Fout bij laden uit IndexedDB: ${e.message}`, 'error');
      }
    };
    
    loadPhotosFromDB();
  }, []);

  const extractUri = (item: any) => {
    // Robust search for any baseUrl or mediaUri in nested structures
    const uri = item.mediaFile?.baseUrl || 
           item.preview?.baseUrl ||
           item.mediaFileUri || 
           item.previewUri || 
           item.mediaItem?.mediaFile?.baseUrl ||
           item.mediaItem?.preview?.baseUrl ||
           item.mediaItem?.mediaFileUri || 
           item.mediaItem?.previewUri || 
           item.baseUrl;
    
    return uri;
  };

  const extractFilename = (item: any) => {
    return item.mediaFile?.filename || 
           item.preview?.filename || 
           item.mediaItem?.mediaFile?.filename || 
           item.mediaItem?.preview?.filename ||
           item.filename || 
           "Foto";
  };

  const fetchImageAsBlobUrl = async (uri: string): Promise<{ blobUrl: string; blobData: string }> => {
    if (!accessToken) throw new Error("Geen access token");
    
    // Request original quality from googleusercontent if applicable
    let finalUri = uri;
    if (uri.includes('googleusercontent.com') && !uri.includes('=')) {
      finalUri = uri + '=d';
    }
    
    const response = await fetch(finalUri, {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (blob.size < 100) throw new Error("Onvoldoende data in blob");
    
    // Convert blob to base64 for IndexedDB storage
    const blobData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    const blobUrl = URL.createObjectURL(blob);
    return { blobUrl, blobData };
  };

  // Effect to regenerate blob URLs from stored blob data on mount
  useEffect(() => {
    const regenerateBlobUrls = () => {
      if (photos.length === 0) return;
      
      const photosNeedingUrls = photos.filter(p => p.blobData && !p.blobUrl);
      if (photosNeedingUrls.length > 0) {
        addLog(`Bezig met regenereren van ${photosNeedingUrls.length} blob URLs...`, 'info');
        
        const updatedPhotos = photos.map(photo => {
          if (photo.blobData && !photo.blobUrl) {
            // Convert base64 back to blob URL
            const blob = dataURLToBlob(photo.blobData);
            const blobUrl = URL.createObjectURL(blob);
            return { ...photo, blobUrl };
          }
          return photo;
        });
        
        setPhotos(updatedPhotos);
        addLog(`Blob URLs geregenereerd`, 'success');
      }
    };

    regenerateBlobUrls();
  }, [photos.length]);

  const dataURLToBlob = (dataURL: string): Blob => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const createPickerSession = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Starten van een nieuwe Google Photos Picker sessie...", 'info');
    try {
      const response = await fetch('https://photospicker.googleapis.com/v1/sessions', {
        method: 'POST',
        headers: { 
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ })
      });
      const data = await response.json();
      if (data.pickerUri) {
        addLog(`Picker sessie aangemaakt. ID: ${data.id}. URI: ${data.pickerUri}`, 'success');
        setIsPicking(true);
        const pickerWindow = window.open(data.pickerUri, '_blank');
        
        const pollTimer = setInterval(async () => {
          try {
            const checkResp = await fetch(`https://photospicker.googleapis.com/v1/sessions/${data.id}`, {
              headers: { Authorization: 'Bearer ' + accessToken }
            });
            const checkData = await checkResp.json();
            addLog(`Polling sessie ${data.id} - Status mediaItemsSet: ${checkData.mediaItemsSet}`, 'info');
            if (checkData.mediaItemsSet) {
              clearInterval(pollTimer);
              addLog("Gebruiker heeft foto's geselecteerd. Items ophalen...", 'success');
              await fetchSessionItems(data.id);
              if (pickerWindow) pickerWindow.close();
              setIsPicking(false);
            }
          } catch (e: any) {
            addLog(`Fout tijdens polling: ${e.message}`, 'error');
          }
        }, 3000);
      } else {
        addLog(`Kon pickerUri niet vinden in response.`, 'error');
      }
    } catch (e: any) {
      addLog(`Picker Session Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionItems = async (sessionId: string) => {
    try {
      addLog(`Media items ophalen voor sessie: ${sessionId}`, 'info');
      const response = await fetch(`https://photospicker.googleapis.com/v1/mediaItems?sessionId=${sessionId}`, {
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      const data = await response.json();
      if (data.mediaItems && data.mediaItems.length > 0) {
        addLog(`${data.mediaItems.length} media items gevonden. Downloaden...`, 'info');

        const processedItems = await Promise.all(data.mediaItems.map(async (item: any) => {
          try {
            const uri = extractUri(item);
            if (!uri) throw new Error("Item heeft geen media URI");
            
            const filename = extractFilename(item);
            const { blobUrl, blobData } = await fetchImageAsBlobUrl(uri);
            
            const photoItem = { 
              ...item, 
              filename,
              blobUrl,
              blobData // Store base64 data for persistence
            };
            
            // Save to IndexedDB
            await savePhotoToIndexedDB(photoItem);
            
            return photoItem;
          } catch (e: any) {
            addLog(`Download fout: ${e.message}`, 'error');
            return null;
          }
        }));

        const finalItems = processedItems.filter(item => item !== null);
        addLog(`${finalItems.length} foto's opgeslagen in IndexedDB`, 'success');
        
        const newPhotos = [...photos, ...finalItems];
        setPhotos(newPhotos);
      } else {
        addLog(`Geen media items gevonden in response of lijst is leeg.`, 'error');
      }
    } catch (e: any) {
      addLog(`Fetch Items Error: ${e.message}`, 'error');
    }
  };

  const clearSlideshow = async () => {
    addLog("Slideshow wissen...", 'info');
    photos.forEach(photo => {
      if (photo.blobUrl) URL.revokeObjectURL(photo.blobUrl);
    });
    setPhotos([]);
    setCurrentIndex(0);
    
    try {
      await clearAllPhotosFromIndexedDB();
      addLog("Slideshow gewist uit IndexedDB", 'success');
    } catch (e: any) {
      addLog(`Fout bij wissen: ${e.message}`, 'error');
    }
  };

  const downloadBackup = async () => {
    try {
      addLog("Backup maken...", 'info');
      const photosToBackup = await getAllPhotosFromIndexedDB();
      
      if (photosToBackup.length === 0) {
        addLog("Geen foto's om te backuppen", 'error');
        return;
      }

      const backup = {
        version: 1,
        timestamp: new Date().toISOString(),
        photos: photosToBackup
      };

      const json = JSON.stringify(backup);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `slideshow-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addLog(`Backup van ${photosToBackup.length} foto's gedownload`, 'success');
    } catch (e: any) {
      addLog(`Backup fout: ${e.message}`, 'error');
    }
  };

  const restoreBackup = async (file: File) => {
    try {
      addLog("Backup herstellen...", 'info');
      
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (!backup.photos || !Array.isArray(backup.photos)) {
        throw new Error("Ongeldig backup formaat");
      }

      // Clear existing photos
      await clearAllPhotosFromIndexedDB();
      photos.forEach(photo => {
        if (photo.blobUrl) URL.revokeObjectURL(photo.blobUrl);
      });

      // Save all photos to IndexedDB
      for (const photo of backup.photos) {
        await savePhotoToIndexedDB(photo);
      }

      // Convert blobData to blobUrls
      const restoredPhotos = backup.photos.map((photo: any) => {
        if (photo.blobData) {
          const blob = dataURLToBlob(photo.blobData);
          const blobUrl = URL.createObjectURL(blob);
          return { ...photo, blobUrl };
        }
        return photo;
      });

      setPhotos(restoredPhotos);
      setCurrentIndex(0);
      
      addLog(`${backup.photos.length} foto's hersteld uit backup`, 'success');
    } catch (e: any) {
      addLog(`Restore fout: ${e.message}`, 'error');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      restoreBackup(file);
    }
  };

  useEffect(() => {
    if (photos.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length);
    }, 30000);
    return () => clearInterval(interval);
  }, [photos.length]);

  if (loading) return (
    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col h-full items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
      <p className="mt-4 text-xs font-black text-gray-400 uppercase tracking-widest">Sessie starten...</p>
    </div>
  );

  if (isPicking) return (
    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col h-full items-center justify-center text-center">
      <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
        <ImageIcon size={40} className="text-blue-400" />
      </div>
      <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-2">Foto's aan het kiezen...</h3>
      <p className="text-sm text-gray-500 mb-8 max-w-xs">Ga naar het geopende tabblad om foto's voor je slideshow te selecteren.</p>
      <div className="flex items-center gap-3 px-6 py-3 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
         <Loader2 size={16} className="animate-spin" />
         <span className="text-[10px] font-black uppercase tracking-widest">Wachten op selectie</span>
      </div>
    </div>
  );

  if (photos.length === 0) return (
    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col h-full items-center justify-center text-center">
      <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mb-6">
        <ImageIcon size={32} className="text-gray-300" />
      </div>
      <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight mb-2">Slideshow Leeg</h3>
      <p className="text-sm text-gray-400 mb-10 max-w-xs">Gebruik de Google Photos Picker om foto's te kiezen of herstel een backup.</p>
      <div className="flex flex-col gap-4">
        <button onClick={createPickerSession} className="px-12 py-6 bg-indigo-600 text-white rounded-[2rem] text-[13px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-3">
          <Plus size={20} /> Foto's Kiezen
        </button>
        <label className="px-12 py-6 bg-gray-100 text-gray-700 rounded-[2rem] text-[13px] font-black uppercase tracking-[0.2em] hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer">
          <Upload size={20} /> Backup Herstellen
          <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>
    </div>
  );

  return (
    <div className="bg-black rounded-[3rem] shadow-sm border border-gray-100 flex flex-col h-full max-h-[1200px] overflow-hidden relative group">
      <div className="absolute inset-0 rounded-[3rem] overflow-hidden">
        {photos.map((photo, idx) => {
            if (!photo.blobUrl) return null;
            
            return (
              <div 
                key={photo.id + idx} 
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
              >
                <img 
                  src={photo.blobUrl} 
                  alt={photo.filename || "Foto"} 
                  className="w-full h-full object-cover" 
                  onError={() => {
                    addLog(`Laadfout voor ${photo.filename || 'item'}`, 'error');
                  }}
                  onLoad={() => {
                    if (idx === currentIndex) addLog(`Zichtbaar: ${photo.filename || 'item'}`, 'success');
                  }}
                />
              </div>
            );
          })}
      </div>
      
      {/* Overlay controls and metadata */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none z-20" />
      
      <div className="absolute top-10 right-10 flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity z-30">
        <button onClick={createPickerSession} className="h-14 px-6 bg-white/20 backdrop-blur-md rounded-2xl flex items-center gap-3 text-white hover:bg-white/40 transition-colors">
          <Plus size={18} /><span className="text-[10px] font-black uppercase tracking-widest">Toevoegen</span>
        </button>
        <button onClick={downloadBackup} title="Backup downloaden" className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-emerald-400 hover:bg-white/40 transition-colors">
          <Download size={18} />
        </button>
        <label title="Backup herstellen" className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-blue-400 hover:bg-white/40 transition-colors cursor-pointer">
          <Upload size={18} />
          <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
        </label>
        <button onClick={clearSlideshow} title="Slideshow wissen" className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-rose-400 hover:bg-white/40 transition-colors">
          <Trash2 size={18} />
        </button>
        <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white">
          <ImageIcon size={20} />
        </div>
      </div>

      <div className="absolute bottom-10 left-10 text-white flex flex-col gap-1 z-30">
        <button 
          onClick={() => setShowPhotosLog(true)}
          className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity text-left cursor-help flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Slideshow • {photos.length} Foto's
        </button>
        <span className="text-xs font-bold truncate max-w-sm pointer-events-none">
          {photos[currentIndex]?.filename || "Laden..."}
        </span>
      </div>

      {showPhotosLog && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center animate-in fade-in bg-black/90 backdrop-blur-md p-10">
          <div className="bg-[#1a1a1a] w-full max-w-3xl h-[90vh] rounded-[3rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl">
            <div className="p-8 bg-[#222] border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-4 text-blue-400">
                <ImageIcon size={24} />
                <h3 className="font-black text-xs uppercase tracking-[0.4em]">Google Photos Debug Log</h3>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => { const text = photosLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n'); navigator.clipboard.writeText(text); }} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all">
                  <Copy size={18} />
                </button>
                <button onClick={() => setPhotosLogs([])} className="p-3 bg-white/5 hover:bg-white/10 text-rose-400 rounded-xl transition-all">
                  <Trash2 size={18} />
                </button>
                <button onClick={() => setShowPhotosLog(false)} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-2 font-mono text-[10px] scroll-smooth no-scrollbar">
              {photosLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-20 text-white font-black uppercase tracking-widest">Geen logs</div>
              ) : photosLogs.map((log, i) => (
                <div key={i} className={`flex gap-4 border-b border-white/5 pb-2 last:border-0 ${log.type === 'error' ? 'text-rose-400' : log.type === 'success' ? 'text-emerald-400' : 'text-gray-400'}`}>
                  <span className="opacity-40 whitespace-nowrap">[{log.timestamp}]</span>
                  <span className="font-bold whitespace-nowrap">[{log.type.toUpperCase()}]</span>
                  <span className="text-white opacity-80 break-all">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Calendar = ({ accessToken, items, isLoading, solarData, onRefresh, isCollapsed, onToggleCollapse }: { accessToken: string | null; items: AgendaItem[]; isLoading: boolean; solarData: SolarDataResponse | null; onRefresh: () => void; isCollapsed: boolean; onToggleCollapse: () => void; }) => {
  const [selectedTimezone, setSelectedTimezone] = useState<string>('Europe/Brussels');
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [selectedWeekType, setSelectedWeekType] = useState<'rolling' | Date>('rolling');
  const [activeFoodAdd, setActiveFoodAdd] = useState<string | null>(null);
  const [isAddingFood, setIsAddingFood] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<AgendaItem | null>(null);

  const weekOptions = useMemo(() => {
    const options: { type: 'rolling' | Date; label: string }[] = [{ type: 'rolling', label: 'Komende 7 dagen' }];
    const baseDate = new Date();
    const day = baseDate.getDay();
    const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
    const firstMonday = new Date(baseDate.setDate(diff));
    firstMonday.setHours(0, 0, 0, 0);

    for (let i = 0; i < 12; i++) {
      const mon = new Date(firstMonday);
      mon.setDate(mon.getDate() + i * 7);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      
      const label = `${mon.getDate().toString().padStart(2, '0')}/${(mon.getMonth() + 1).toString().padStart(2, '0')} - ${sun.getDate().toString().padStart(2, '0')}/${(sun.getDate() + 1).toString().padStart(2, '0')}`;
      options.push({ type: mon, label });
    }
    return options;
  }, []);

  const weekDays = useMemo(() => {
    if (selectedWeekType === 'rolling') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
      });
    } else {
      const baseDate = selectedWeekType;
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
  }, [selectedWeekType]);
  
  const getEventsForDay = (date: Date) => {
    const dayStr = date.toLocaleDateString('en-CA', { timeZone: selectedTimezone });
    return items.filter(item => { 
      if (item.isAllDay && item.allDayStartStr && item.allDayEndStr) {
        return dayStr >= item.allDayStartStr && dayStr < item.allDayEndStr;
      }
      const startDayStr = item.start.toLocaleDateString('en-CA', { timeZone: selectedTimezone });
      const endDayStr = new Date(item.end.getTime() - 1).toLocaleDateString('en-CA', { timeZone: selectedTimezone });
      return dayStr >= startDayStr && dayStr <= endDayStr;
    });
  };

  const getSolarForecastForDay = (date: Date) => {
    if (!solarData?.solar) return null;
    const dStr = date.getDate().toString().padStart(2, '0') + '/' + (date.getMonth() + 1).toString().padStart(2, '0') + '/' + date.getFullYear();
    // Search for a forecast entry with this date
    return Object.values(solarData.solar).find(item => item.date === dStr && item.description.includes('estimated'));
  };

  const toggleTimezone = () => {
    setSelectedTimezone(prev => prev === 'UTC' ? 'Europe/Brussels' : 'UTC');
  };

  const isWaste = (title: string) => ['PMD', 'RA', 'P/K', 'GLA'].includes(title.trim().toUpperCase());
  
  const isFood = (title: string) => title.trim().toLowerCase().startsWith('eten');

  const getFoodIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('burger')) return <Hamburger size={24} className="text-indigo-400" />;
    if (t.includes('pizza')) return <Pizza size={24} className="text-orange-500" />;
    if (t.includes('friet')) return <ChefHat size={24} className="text-amber-500" />;
    if (t.includes('taco')) return <ChefHat size={24} className="text-yellow-600" />;
    if (t.includes('wrap')) return <Sandwich size={24} className="text-yellow-500" />;
    if (t.includes('spaghetti')) return <Soup size={24} className="text-rose-500" />;
    if (t.includes('spinazie')) return <Salad size={24} className="text-emerald-500" />;
    if (t.includes('kip')) return <Drumstick size={24} className="text-orange-400" />;
    if (t.includes('croque')) return <Sandwich size={24} className="text-amber-600" />;
    if (t.includes('sushi')) return <Fish size={24} className="text-indigo-400" />;
    if (t.includes('vis')) return <Fish size={24} className="text-indigo-400" />;
    if (t.includes('soep')) return <Soup size={24} className="text-rose-500" />;
    return <Utensils size={20} className="text-gray-300" />;
  };

  const addFoodToCalendar = async (date: Date, dish: string) => {
    if (!accessToken) return;
    setIsAddingFood(true);
    try {
      const startStr = date.toISOString().split('T')[0];
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const endStr = nextDay.toISOString().split('T')[0];

      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { 
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: `Eten ${dish}`,
          start: { date: startStr },
          end: { date: endStr }
        })
      });

      if (!resp.ok) throw new Error('Kon evenement niet toevoegen');
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Fout bij toevoegen aan kalender');
    } finally {
      setIsAddingFood(false);
      setActiveFoodAdd(null);
    }
  };

  const deleteFoodFromCalendar = async () => {
    if (!accessToken || !itemToDelete) return;
    try {
      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${itemToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      if (!resp.ok) throw new Error('Kon item niet verwijderen');
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Fout bij verwijderen uit kalender');
    } finally {
      setItemToDelete(null);
    }
  };

  const currentLabel = useMemo(() => {
    if (selectedWeekType === 'rolling') return 'Komende 7 dagen';
    const sun = new Date(selectedWeekType);
    sun.setDate(sun.getDate() + 6);
    return `${selectedWeekType.getDate().toString().padStart(2, '0')}/${(selectedWeekType.getMonth() + 1).toString().padStart(2, '0')} - ${sun.getDate().toString().padStart(2, '0')}/${(sun.getDate() + 1).toString().padStart(2, '0')}`;
  }, [selectedWeekType]);

  return (
    <div className={`bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col transition-all duration-500 overflow-hidden relative ${isCollapsed ? 'h-auto' : 'h-full'}`}>
      <div className="flex justify-between items-center shrink-0 mb-4">
        <div className="flex items-center gap-6">
          <h2 className="text-4xl font-light text-gray-800 tracking-tight">Week Agenda</h2>
          {!isCollapsed && accessToken && !isLoading && ( 
            <button onClick={onRefresh} className="flex items-center gap-3 px-4 py-2 bg-blue-50 text-[11px] text-blue-600 font-black rounded-full uppercase tracking-widest border border-blue-100 hover:bg-blue-100">
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} /> Verversen
            </button> 
          )}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 top-10 z-10">
          <button 
            onClick={toggleTimezone}
            className="flex items-center gap-3 px-6 py-3 bg-gray-50 border border-gray-100 rounded-full hover:bg-gray-100 transition-all active:scale-95 shadow-sm"
          >
            <Globe size={14} className="text-blue-500" />
            <span className="text-[12px] font-black text-gray-700 uppercase tracking-widest">
              {selectedTimezone === 'UTC' ? 'UTC' : 'Brussels (CET)'}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-8">
          <div className="relative">
            <button 
              onClick={() => setShowWeekPicker(!showWeekPicker)}
              className="text-[11px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2 hover:text-indigo-500 transition-colors py-2"
            >
              {currentLabel}
              <ChevronDown size={14} className={`transition-transform ${showWeekPicker ? 'rotate-180' : ''}`} />
            </button>
            
            {showWeekPicker && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-100 rounded-[1.5rem] shadow-2xl z-[100] p-2 animate-in fade-in zoom-in-95 duration-200">
                <div className="max-h-[350px] overflow-y-auto no-scrollbar">
                  {weekOptions.map((opt, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        setSelectedWeekType(opt.type);
                        setShowWeekPicker(false);
                      }}
                      className={`w-full text-left px-5 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-between group ${
                        (opt.type === 'rolling' && selectedWeekType === 'rolling') || 
                        (opt.type instanceof Date && selectedWeekType instanceof Date && opt.type.getTime() === selectedWeekType.getTime()) 
                        ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-50 text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      {opt.label}
                      <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                        (opt.type === 'rolling' && selectedWeekType === 'rolling') || 
                        (opt.type instanceof Date && selectedWeekType instanceof Date && opt.type.getTime() === selectedWeekType.getTime()) 
                        ? 'opacity-100' : ''}`} 
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={onToggleCollapse} className="w-12 h-12 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-2xl transition-all active:scale-90">
            {isCollapsed ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
          </button>
        </div>
      </div>
      {!isCollapsed && ( 
        <div className="flex-1 overflow-hidden mt-6 animate-in fade-in">
          {!accessToken ? ( 
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 px-10 opacity-40">
              <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center mb-2"><CalendarIcon className="w-12 h-12 text-blue-300" /></div>
              <p className="text-gray-500 text-xl font-medium max-w-sm">Synchroniseer met Google Agenda om je weekplanning te zien</p>
            </div> 
          ) : isLoading ? ( 
            <div className="h-full flex flex-col items-center justify-center space-y-8">
              <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
              <p className="text-xs text-gray-400 font-black uppercase tracking-[0.4em] animate-pulse">Agenda ophalen...</p>
            </div> 
          ) : ( 
            <div className="grid grid-cols-7 h-full gap-px bg-gray-100 border border-gray-100 rounded-[2.5rem] overflow-hidden">
              {weekDays.map((date, idx) => { 
                const dayEvents = getEventsForDay(date); 
                const wasteEvents = dayEvents.filter(e => isWaste(e.title));
                const foodEvents = dayEvents.filter(e => isFood(e.title));
                const regularEvents = dayEvents.filter(e => !isWaste(e.title) && !isFood(e.title));
                const solarForecast = getSolarForecastForDay(date);
                const today = new Date().toDateString() === date.toDateString(); 
                const dateKey = date.toISOString().split('T')[0];

                return ( 
                  <div key={idx} className={`bg-white flex flex-col min-w-0 ${today ? 'bg-blue-50/20' : ''} relative`}>
                    <div className={`p-6 text-center border-b border-gray-50 shrink-0 ${today ? 'bg-blue-500/5' : ''}`}>
                      <div className={`text-[11px] font-black tracking-widest ${today ? 'text-blue-600' : 'text-gray-400'}`}>
                        {date.toLocaleDateString('nl-BE', { weekday: 'short' }).toUpperCase()}
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <div className={`text-3xl font-black ${today ? 'text-blue-600' : 'text-gray-800'}`}>{date.getDate()}</div>
                        {wasteEvents.length > 0 && (
                          <div className="flex items-center gap-1">
                            {wasteEvents.map(w => {
                              const t = w.title.trim().toUpperCase();
                              if (t === 'PMD') return <Recycle key={w.id} size={20} className="text-blue-500" strokeWidth={2.5} />;
                              if (t === 'RA') return <Trash2 key={w.id} size={20} className="text-gray-400" strokeWidth={2.5} />;
                              if (t === 'P/K') return <Package key={w.id} size={20} className="text-amber-500" strokeWidth={2.5} />;
                              if (t === 'GLA') return <Wine key={w.id} size={20} className="text-blue-600" strokeWidth={2.5} />;
                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-0 space-y-0.5 no-scrollbar">
                      {regularEvents.sort((a,b) => (a.isAllDay ? -1 : 1) - (b.isAllDay ? -1 : 1)).map(item => ( 
                        <div 
                          key={item.id + date.toISOString()} 
                          onClick={() => window.open(item.htmlLink, '_blank')} 
                          style={item.isAllDay ? { backgroundColor: item.color || '#9ca3af' } : {}} 
                          className={`w-full cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all ${
                            item.isAllDay 
                              ? 'p-0.5 rounded-sm shadow-sm border border-black/5' 
                              : 'px-0.5 py-2 bg-transparent'
                          }`}
                        >
                          <div className={`flex flex-col ${!item.isAllDay ? 'text-black' : 'text-white'}`}>
                            {!item.isAllDay && (
                              <span className="text-[23px] font-black opacity-40 leading-none tabular-nums uppercase pl-1">
                                {item.start.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: selectedTimezone })}
                                {' - '}
                                {item.end.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: selectedTimezone })}
                              </span>
                            )}
                            <span className="text-[30px] font-bold leading-tight line-clamp-3 pl-1 pr-1">
                              {item.title}
                            </span>
                          </div>
                        </div> 
                      ))} 
                    </div>

                    <div className="mt-auto border-t border-gray-100 bg-amber-50/10 p-4">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Menu</span>
                        {foodEvents.length > 0 ? foodEvents.map(f => {
                          const displayFood = f.title.replace(/^Eten\s+/i, '');
                          return (
                            <div key={f.id} className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setItemToDelete(f); }}
                                className="hover:scale-110 active:scale-90 transition-transform cursor-pointer"
                                title="Verwijder dit menu-item"
                              >
                                {getFoodIcon(f.title)}
                              </button>
                              <span className="text-[26px] font-black text-gray-800 tracking-tight leading-none">
                                {displayFood}
                              </span>
                            </div>
                          );
                        }) : (
                          <div className="relative">
                            <button 
                              onClick={() => setActiveFoodAdd(activeFoodAdd === dateKey ? null : dateKey)}
                              className="w-full h-12 flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-400 rounded-xl transition-all active:scale-95 group"
                            >
                              <Plus size={24} className="group-hover:rotate-90 transition-transform" />
                            </button>
                            
                            {activeFoodAdd === dateKey && (
                              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-amber-100 rounded-2xl shadow-2xl z-50 p-2 animate-in zoom-in-95 fade-in duration-200">
                                <div className="max-h-128 overflow-y-auto no-scrollbar grid grid-cols-1 gap-1">
                                  {FOOD_OPTIONS.map(dish => (
                                    <button
                                      key={dish}
                                      onClick={() => addFoodToCalendar(date, dish)}
                                      disabled={isAddingFood}
                                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-amber-50 text-xs font-black text-amber-700 uppercase tracking-widest transition-all flex items-center justify-between"
                                    >
                                      {dish}
                                      <div className="w-6 h-6 flex items-center justify-center opacity-40">
                                        {getFoodIcon('Eten ' + dish)}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Solar Yield Bottom Display */}
                      {solarForecast && (
                        <div className="mt-3 pt-3 border-t border-amber-200/40 flex items-center justify-between animate-in fade-in">
                          <div className="flex items-center gap-2">
                             <Sun size={14} className="text-amber-500 fill-amber-50" />
                             <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest"></span>
                          </div>
                          <span className="text-sm font-black text-amber-700 tabular-nums">
                            {solarForecast.value} <span className="text-[10px] opacity-60">kWh</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div> 
                ); 
              })}
            </div> 
          )}
        </div> 
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center animate-in fade-in duration-300 bg-black/60 backdrop-blur-sm p-10">
          <div className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl flex flex-col items-center text-center">
             <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-[1.5rem] flex items-center justify-center mb-8">
               <Trash2 size={32} />
             </div>
             <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest mb-4">Gerecht verwijderen?</h3>
             <p className="text-sm text-gray-500 mb-10 leading-relaxed font-medium">Weet je zeker dat je <strong>{itemToDelete.title.replace(/^Eten\s+/i, '')}</strong> wilt verwijderen van de kalender?</p>
             <div className="flex gap-4 w-full">
                <button onClick={() => setItemToDelete(null)} className="flex-1 py-5 bg-gray-50 text-gray-400 hover:bg-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Annuleren</button>
                <button onClick={deleteFoodFromCalendar} className="flex-1 py-5 bg-rose-500 text-white hover:bg-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-100 transition-all">Verwijderen</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SpotifyWidget = ({ config, accessToken, onRefreshConfig }: { config: SpotifyConfig | null; accessToken: string | null; onRefreshConfig: () => void }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editUsername, setEditUsername] = useState(config?.username || "");
  const [editPasswordB64, setEditPasswordB64] = useState(config?.password_b64 || "");

  useEffect(() => {
    if (config) {
      setEditUsername(config.username);
      setEditPasswordB64(config.password_b64);
    }
  }, [config]);

  const handleSaveConfig = async () => {
    if (!accessToken) return;
    setIsSaving(true);
    try {
      const searchResp = await fetch("https://www.googleapis.com/drive/v3/files?q=name='WalboFamiilyConfig.txt' and trashed=false", {
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      if (!searchResp.ok) throw new Error(`Search failed: ${searchResp.statusText}`);
      
      const searchData = await searchResp.json();
      let fileId = null;
      let existingContent: any = { connections: { spotify: { username: "", password_b64: "" } } };

      if (searchData.files && searchData.files.length > 0) {
        fileId = searchData.files[0].id;
        const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: 'Bearer ' + accessToken }
        });
        
        if (fileResp.ok) {
           const text = await fileResp.text();
           try {
             existingContent = text ? JSON.parse(text) : { connections: { spotify: { username: "", password_b64: "" } } };
           } catch (e) {
             existingContent = { connections: { spotify: { username: "", password_b64: "" } } };
           }
        }
      }

      const currentConnections = existingContent?.connections || {};
      const newContent = {
        ...existingContent,
        connections: {
          ...currentConnections,
          spotify: {
            username: editUsername,
            password_b64: editPasswordB64
          }
        }
      };

      const bodyContent = JSON.stringify(newContent, null, 2);

      if (fileId) {
        const updateResp = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: { 
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'text/plain'
          },
          body: bodyContent
        });
        if (!updateResp.ok) throw new Error(`Update failed: ${updateResp.statusText}`);
      } else {
        const metadata = {
          name: 'WalboFamiilyConfig.txt',
          mimeType: 'text/plain'
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([bodyContent], { type: 'text/plain' }));

        const createResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + accessToken },
          body: form
        });
        if (!createResp.ok) throw new Error(`Create failed: ${createResp.statusText}`);
      }

      alert("Spotify configuratie succesvol opgeslagen op Google Drive!");
      setShowSettings(false);
      onRefreshConfig();
    } catch (e: any) {
      alert(`Fout bij opslaan van configuratie: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const WidgetContent = () => (
    <div className="flex-1 flex flex-col items-center justify-center space-y-6">
      <div className="relative group">
         <div className="w-40 h-40 bg-gray-100 rounded-[2.5rem] overflow-hidden shadow-2xl transition-transform group-hover:scale-105 duration-500">
           <img src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop" alt="Album Art" className="w-full h-full object-cover" />
         </div>
         <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-white shadow-lg">
           <Volume2 size={16} />
         </div>
      </div>

      <div className="text-center w-full px-4">
        <h4 className="text-xl font-black text-gray-800 tracking-tight truncate">Mockingbird</h4>
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Eminem</p>
      </div>

      <div className="w-full space-y-3 px-4">
        <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-400 w-2/3 rounded-full" />
        </div>
        <div className="flex justify-between text-[10px] font-black text-gray-300 tabular-nums">
          <span>2:34</span>
          <span>4:11</span>
        </div>
      </div>

      <div className="flex items-center gap-10 text-gray-400">
        <button className="hover:text-emerald-500 transition-colors"><SkipBack size={24} fill="currentColor" /></button>
        <button onClick={() => setIsPlaying(!isPlaying)} className="w-14 h-14 bg-gray-900 text-white rounded-2xl flex items-center justify-center hover:bg-black transition-all active:scale-90 shadow-xl">
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
        </button>
        <button className="hover:text-emerald-500 transition-colors"><SkipForward size={24} fill="currentColor" /></button>
      </div>
    </div>
  );

  return (
    <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1 flex flex-col transition-all hover:border-emerald-200 relative">
      <div className="flex justify-between items-center mb-6">
        <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2">
          <Music size={10} className="text-emerald-500" /> Spotify
        </span>
        <div className="flex items-center gap-4">
           {config && (
             <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{config.username}</span>
             </div>
           )}
           <button onClick={() => setShowSettings(true)} className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:text-emerald-500 transition-colors">
              <Settings size={14} />
            </button>
        </div>
      </div>

      {!config ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mb-6">
            <Music className="text-emerald-400" />
          </div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 leading-relaxed">Configuratie ontbreekt of is onvolledig</p>
          <button onClick={() => setShowSettings(true)} className="px-8 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 active:scale-95 transition-all">
            Instellen
          </button>
        </div>
      ) : (
        <WidgetContent />
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center animate-in fade-in duration-300 bg-white/95 backdrop-blur-3xl p-10">
          <div className="bg-white w-full max-w-2xl p-16 rounded-[4rem] shadow-2xl border border-gray-100 flex flex-col">
            <div className="flex justify-between items-center w-full mb-10">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-[1.5rem] flex items-center justify-center">
                  <Music size={28} />
                </div>
                <h3 className="text-2xl font-black text-gray-900 uppercase tracking-widest">Spotify Beheer</h3>
              </div>
              <button onClick={() => setShowSettings(false)} className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={24} />
              </button>
            </div>

            <p className="text-sm text-gray-500 leading-relaxed mb-10">
              Deze configuratie wordt gesynchroniseerd via het bestand <strong>WalboFamiilyConfig.txt</strong> op je Google Drive.
            </p>

            <div className="space-y-8 mb-12">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Spotify Gebruikersnaam</label>
                <input 
                  type="text" 
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Bijv. jandevries"
                  className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-sm font-bold focus:outline-none focus:border-emerald-400 transition-colors"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Password (Base64)</label>
                <div className="relative">
                  <input 
                    type="password" 
                    value={editPasswordB64}
                    onChange={(e) => setEditPasswordB64(e.target.value)}
                    placeholder="Base64 encoded string"
                    className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-sm font-bold focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-emerald-500">
                    <Key size={18} />
                  </div>
                </div>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest ml-4 mt-2">Let op: Gebruik een base64 encoded wachtwoord voor veiligheid.</p>
              </div>
            </div>

            <div className="w-full p-8 bg-emerald-50 rounded-[2rem] border border-emerald-100 mb-12">
              <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><Info size={12} /> Instructies</h4>
              <p className="text-[11px] text-emerald-600 font-medium leading-relaxed">
                De Hub leest je Spotify gegevens uit de 'connections' sectie van het config bestand. 
                Zorg ervoor dat je ingelogd bent met Google om deze wijzigingen direct naar Drive te schrijven.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <button 
                onClick={handleSaveConfig} 
                disabled={isSaving || !accessToken}
                className={`w-full py-8 rounded-[2rem] font-black text-lg uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center justify-center gap-4 ${accessToken ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100' : 'bg-gray-100 text-gray-400'}`}
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <><Save size={20} /> Opslaan naar Google Drive</>}
              </button>
              {!accessToken && (
                <p className="text-center text-rose-500 text-[10px] font-black uppercase tracking-widest mt-2">Log eerst in met Google om te kunnen opslaan.</p>
              )}
            </div>
          </div>
        </div>
      )}
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
  const [activeMainView, setActiveMainView] = useState<'agenda' | 'photos'>('agenda');
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
  const [spotifyConfig, setSpotifyConfig] = useState<SpotifyConfig | null>(null);
  const tokenClientRef = useRef<any>(null);

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
    await fetchSpotifyConfig(token);
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
          if (!isAllDay) {
            displayTitle = displayTitle
              .replace(/\s*\d{1,2}[u:]\d{0,2}\s*-\s*\d{1,2}[u:]\d{0,2}/gi, '')
              .replace(/\s*\d{1,2}[u:]\d{2}/gi, '')
              .replace(/\s*\d{1,2}\s*u/gi, '')
              .trim();
          }

          return { 
            id: event.id, 
            start: startDate, 
            end: endDate, 
            title: displayTitle, 
            color: GOOGLE_COLOR_MAP[event.colorId] || '#10b981', 
            isAllDay, 
            htmlLink: event.htmlLink,
            allDayStartStr: isAllDay ? startRaw : undefined,
            allDayEndStr: isAllDay ? endRaw : undefined
          }; 
        }); 
        setAgendaItems(mapped); 
      }
    } catch (e) { console.error(e); } finally { setAgendaLoading(false); } 
  };

  const fetchSpotifyConfig = async (token: string) => {
    try {
      const searchResp = await fetch("https://www.googleapis.com/drive/v3/files?q=name='WalboFamiilyConfig.txt' and trashed=false", {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!searchResp.ok) return;
      const searchData = await searchResp.json();
      if (searchData.files && searchData.files.length > 0) {
        const fileId = searchData.files[0].id;
        const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (!fileResp.ok) return;
        const configData = await fileResp.json();
        if (configData?.connections?.spotify) {
          setSpotifyConfig({
            username: configData.connections.spotify.username,
            password_b64: configData.connections.spotify.password_b64
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch Spotify config from Drive", e);
    }
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
            {accessToken && ( <button onClick={() => setActiveMainView(activeMainView === 'agenda' ? 'photos' : 'agenda')} className={'w-16 h-16 border rounded-[2rem] shadow-xl flex items-center justify-center transition-all ' + (activeMainView === 'photos' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-gray-100 text-gray-400 hover:text-gray-900')}>{activeMainView === 'agenda' ? <ImageIcon size={24} /> : <CalendarIcon size={24} />}</button> )}
            <button onClick={toggleFullScreen} className="w-16 h-16 bg-white border border-gray-100 rounded-[2rem] shadow-xl flex items-center justify-center text-gray-400 hover:text-gray-900">{isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}</button>
            {!accessToken ? (<button onClick={() => handleLogin()} disabled={isSyncing} className="px-12 py-6 bg-gray-900 text-white rounded-[2.5rem] text-[13px] font-black uppercase tracking-widest shadow-2xl">Google Sync</button>) : ( <div className="flex items-center gap-8 bg-white p-4 pr-10 rounded-[2.5rem] border border-gray-100 shadow-xl cursor-pointer" onClick={handleLogout}><div className="w-16 h-16 bg-gray-100 rounded-3xl overflow-hidden border border-gray-50"><img src={user?.picture} alt="" className="w-full h-full object-cover" /></div><div className="text-right"><div className="text-[13px] font-black text-gray-900 uppercase tracking-widest">{user?.name}</div><div className="text-[10px] text-green-500 font-bold flex items-center justify-end gap-2 mt-1"><CheckCircle2 size={12}/> ONLINE</div></div></div> )}
            <WeatherWidget data={weatherData} onClick={() => fetchWeatherForecast(true)} isRefreshing={weatherLoading} />
          </div>
        </div>
      </header>
      <main className="w-full px-[50px] pt-3 pb-4 grid grid-cols-1 xl:grid-cols-10 gap-10 flex-1 overflow-hidden">
        <section className="xl:col-span-7 h-full">
          {activeMainView === 'agenda' ? ( 
            <Calendar 
              accessToken={accessToken} 
              items={agendaItems} 
              isLoading={agendaLoading} 
              solarData={solarForecastData}
              onRefresh={() => accessToken && fetchCalendarEvents(accessToken)} 
              isCollapsed={isAgendaCollapsed} 
              onToggleCollapse={() => setIsAgendaCollapsed(!isAgendaCollapsed)} 
            /> 
          ) : ( 
            <GooglePhotosWidget accessToken={accessToken} onForceLogout={handleLogout} /> 
          )}
        </section>
        <aside className="xl:col-span-3 space-y-10 flex flex-col h-full overflow-y-auto no-scrollbar">
          <EnergyWidget data={energyData} error={energyError} onTitleClick={() => setShowEnergyLogs(true)} onWidgetClick={() => setIsEnergyOpen(true)} apiUrl={ENERGY_ENDPOINT} />
          <TimerWidget />
          <GeminiAssistantWidget />
          <SpotifyWidget config={spotifyConfig} accessToken={accessToken} onRefreshConfig={() => accessToken && fetchSpotifyConfig(accessToken)} />
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