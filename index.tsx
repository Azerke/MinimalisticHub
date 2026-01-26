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
  Mic, MicOff, AlertTriangle, ExternalLink, LogOut, Globe
} from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

// --- Constants & Types ---
const CLIENT_ID = '83368315587-g04nagjcgrsaotbdpet6gq2f7njrh2tu.apps.googleusercontent.com';
const SCOPES = 'openid profile email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/photoslibrary.readonly';
const ENERGY_ENDPOINT = 'https://100.74.104.126:1881/evdata';
const NODERED_DASHBOARD = 'https://100.74.104.126:1881/dashboard/page1';
const VICTRON_VRM_URL = 'https://vrm.victronenergy.com/installation/756249/dashboard';

const WEATHER_CACHE_KEY = 'hub_weather_cache';
const USER_CACHE_KEY = 'hub_user_profile_v3';

const GOOGLE_COLOR_MAP: Record<string, string> = {
  "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73", "5": "#f6bf26", 
  "6": "#f4511e", "7": "#039be5", "8": "#616161", "9": "#3f51b5", "10": "#0b8043", "11": "#d50000",
};

interface AgendaItem {
  id: string; 
  start: Date; 
  end: Date; 
  title: string; 
  location: string;
  category: 'work' | 'personal' | 'health' | 'social'; 
  color: string; 
  isAllDay: boolean; 
  htmlLink: string;
  allDayStartStr?: string; // Store raw ISO date for precise comparison
  allDayEndStr?: string;   // Store raw ISO date (exclusive)
}

interface WeatherData {
  location: string; currentTemp: number; condition: string; humidity: number; windSpeed: string;
  hourly: { time: string; temp: number; icon: 'sun' | 'cloud' | 'rain' | 'storm' | 'snow' | 'drizzle' }[];
  daily: { day: string; low: number; high: number; condition: string; icon: 'sun' | 'cloud' | 'rain' | 'storm' | 'snow' | 'drizzle' }[];
}

interface EnergyData {
  houseLoad: number; 
  evPower: number; 
  evChargedToday: number; 
  evChargedMonth: number; 
  evTotalCounter: number;
  evStatus: string; 
  solarTotal: number; 
  solarAC: number; 
  solarDC: number; 
  solarDCDay: number;
  solarACDay: number; 
  solarTotalDay: number; 
  gridTotal: number; 
  gridSetpoint: number;
  dcPower: number; // New data point from grid.dc_power
  soc: number; 
  batteryStatus: string; 
  batteryPower: number; 
  forecastPrediction: number;
  forecastSummary: string; 
  timestamp: string;
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

const getWeatherInfo = (code: number): { icon: 'sun' | 'cloud' | 'rain' | 'storm' | 'snow' | 'drizzle', text: string } => {
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

const VisualBattery = ({ soc, status }: { soc: number, status: string }) => {
  const isCharging = status.toLowerCase() === 'opladen';
  const fillColor = isCharging ? 'bg-emerald-500' : 'bg-orange-500';
  const displaySoc = soc + '%';
  const barHeight = soc + '%';
  return (
    <div className="relative w-40 h-64 border-4 border-gray-800 rounded-[1.5rem] p-1.5 flex items-end">
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
  const [logs, setLogs] = useState<{timestamp: string, msg: string, type: 'info' | 'error' | 'success'}[]>([]);
  const [showLogs, setShowLogs] = useState(false);
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
      if (isAuthError) { addLog("Authenticatie fout gedetecteerd.", 'error'); setNeedsKey(true); setErrorMsg("API Key ongeldig of niet gekoppeld."); }
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
      await (window as any).aistudio.openSelectKey(); setErrorMsg(null); setNeedsKey(false);
      setTimeout(startSession, 500);
    }
  };

  const startSession = async () => {
    if (isActive || isStarting) return;
    setIsStarting(true); setErrorMsg(null); setNeedsKey(false);
    if ((window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey && !process.env.API_KEY) { setNeedsKey(true); setErrorMsg("Koppel een betaalde API Key om te starten."); setIsStarting(false); return; }
    }
    try {
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
            sessionActiveRef.current = true; setIsActive(true); setIsStarting(false);
            const source = inCtx.createMediaStreamSource(stream);
            const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBytes = createPCMUnit8Array(inputData);
              sessionPromise.then((session) => { session.sendRealtimeInput({ media: { data: encode(pcmBytes), mimeType: 'audio/pcm;rate=16000' } }); });
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

  const copyLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n');
    navigator.clipboard.writeText(text); addLog("Logs gekopieerd naar klembord.", 'success');
  };

  return (
    <>
      <div className={`p-8 rounded-[2.5rem] shadow-sm border transition-all duration-500 overflow-hidden relative ${isActive ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100'}`}>
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setShowLogs(true)} className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2 hover:text-indigo-400 transition-colors">
            <span className={`w-2 h-2 rounded-full ${(isActive || isStarting) ? 'bg-indigo-500 animate-pulse' : 'bg-gray-300'}`} /> Gemini Hub Live
          </button>
          <button onClick={isActive ? () => stopSession() : startSession} disabled={isStarting} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${(isActive || isStarting) ? 'bg-indigo-500 text-white shadow-lg' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
            {isStarting ? <Loader2 size={20} className="animate-spin" /> : isActive ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        </div>
        <div className="space-y-4">
          {errorMsg ? (
            <div className="py-2"><div className="flex items-center gap-3 text-rose-500 mb-3"><AlertTriangle size={16} /><p className="text-[11px] font-bold leading-tight">{errorMsg}</p></div>{needsKey && (<button onClick={handleKeySetup} className="w-full py-3 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-colors shadow-sm">Koppel API Key</button>)}</div>
          ) : isActive ? (
            <div className="py-4"><div className="flex items-center gap-2 mb-2"><div className={`flex items-end gap-1 h-6 ${isSpeaking ? 'animate-pulse' : ''}`}>{[1, 2, 3, 4, 5].map(i => (<div key={i} className={`w-1 bg-indigo-400 rounded-full transition-all duration-300 ${isSpeaking ? 'h-full' : 'h-2'}`} style={{animationDelay: `${i * 0.1}s`}} />))}</div><span className="text-xs font-black text-indigo-600 uppercase tracking-widest">{isSpeaking ? 'Hub spreekt...' : 'Hub luistert...'}</span></div></div>
          ) : isStarting ? ( <p className="text-sm font-medium text-indigo-400 leading-relaxed animate-pulse">Initialiseren...</p> ) : (<p className="text-sm font-medium text-gray-500 leading-relaxed">Activeer de assistent voor een live gesprek.</p>)}
        </div>
      </div>
      {showLogs && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center animate-in fade-in bg-black/80 backdrop-blur-md p-10">
          <div className="bg-[#1a1a1a] w-full max-w-4xl h-[80vh] rounded-[3rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl">
            <div className="p-8 bg-[#222] border-b border-white/5 flex justify-between items-center"><div className="flex items-center gap-4 text-indigo-400"><Terminal size={24} /><h3 className="font-black text-xs uppercase tracking-[0.4em]">Gemini Live Console Logs</h3></div><div className="flex items-center gap-4"><button onClick={copyLogs} className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all"><Copy size={18} /></button><button onClick={() => setLogs([])} className="p-3 bg-white/5 hover:bg-white/10 text-rose-400 rounded-xl transition-all"><Trash2 size={18} /></button><button onClick={() => setShowLogs(false)} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all"><X size={24} /></button></div></div>
            <div className="flex-1 overflow-y-auto p-8 space-y-2 font-mono text-[11px] scroll-smooth no-scrollbar">
              {logs.length === 0 ? ( <div className="h-full flex items-center justify-center opacity-20 text-white font-black uppercase tracking-widest">Geen logs beschikbaar</div> ) : logs.map((log, i) => ( <div key={i} className={`flex gap-4 border-b border-white/5 pb-2 last:border-0 ${log.type === 'error' ? 'text-rose-400' : log.type === 'success' ? 'text-emerald-400' : 'text-gray-400'}`}><span className="opacity-40 whitespace-nowrap">[{log.timestamp}]</span><span className="font-bold whitespace-nowrap">[{log.type.toUpperCase()}]</span><span className="text-white opacity-80 break-all">{log.msg}</span></div> ))}
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
    const scrollRef = useRef<HTMLDivElement>(null); const itemHeight = 120; const items = Array.from({ length: max + 1 }, (_, i) => i);
    const [isDragging, setIsDragging] = useState(false); const [startY, setStartY] = useState(0); const [startScroll, setStartScroll] = useState(0);
    useEffect(() => { if (scrollRef.current && !isDragging) scrollRef.current.scrollTop = value * itemHeight; }, [value, isDragging]);
    const handleScroll = () => { if (!scrollRef.current) return; const index = Math.round(scrollRef.current.scrollTop / itemHeight); if (items[index] !== undefined && items[index] !== value) onChange(items[index]); };
    const handleMouseDown = (e: React.MouseEvent) => { setIsDragging(true); setStartY(e.pageY); setStartScroll(scrollRef.current?.scrollTop || 0); };
    const handleMouseMove = (e: React.MouseEvent) => { if (!isDragging || !scrollRef.current) return; scrollRef.current.scrollTop = startScroll + (startY - e.pageY); };
    return (
      <div className="flex flex-col items-center flex-1 touch-none select-none cursor-ns-resize" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">{label}</span>
        <div className="relative h-[360px] w-full flex items-center justify-center overflow-hidden">
           <div className="absolute top-1/2 left-0 right-0 h-[120px] -translate-y-1/2 border-y-2 border-indigo-100 bg-indigo-50/20 -z-10 pointer-events-none rounded-[2rem]" />
           <div ref={scrollRef} onScroll={handleScroll} className="w-full h-full overflow-y-auto no-scrollbar snap-y snap-mandatory py-[120px] scroll-smooth" style={{ perspective: '1200px', touchAction: 'pan-y' }}>
             {items.map(i => (
               <div key={i} className="h-[120px] flex items-center justify-center snap-center transition-all duration-300 pointer-events-none" style={{ opacity: Math.max(0.1, 1 - Math.abs(value-i)*0.4), transform: `scale(${Math.max(0.7, 1.25-Math.abs(value-i)*0.2)}) rotateX(${(i-value)*18}deg)`, transformOrigin: 'center center', backfaceVisibility: 'hidden' }}>
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

const EnergyOverlay = ({ data, onClose }: { data: EnergyData | null, onClose: () => void }) => {
  const [showNodeRed, setShowNodeRed] = useState(false);
  if (!data) return null;
  const batteryPowerDisplay = data.batteryPower + 'W';
  const gridTotalDisplay = data.gridTotal + 'W';
  const gridSetpointDisplay = data.gridSetpoint + 'W';
  const evPowerDisplay = data.evPower + 'W';
  const evChargedTodayDisplay = data.evChargedToday + 'kWh';
  const evChargedMonthDisplay = data.evChargedMonth + 'kWh';
  const evTotalCounterDisplay = 'Totaal: ' + data.evTotalCounter + ' kWh (Lifetime)';
  const solarTotalDisplay = data.solarTotal + 'W';
  const solarACDisplay = 'AC: ' + data.solarAC + 'W';
  const solarDCDisplay = 'DC: ' + data.solarDC + 'W';
  const solarTotalDayDisplay = data.solarTotalDay + 'kWh';
  const solarDCDayDisplay = data.solarDCDay + 'kWh';

  return (
    <div className="absolute inset-0 z-[250] flex items-center justify-center animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-[100px]" onClick={onClose} />
      <div className="relative w-full h-full bg-white/40 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-8 flex justify-between items-center bg-white/20 backdrop-blur-xl shrink-0 border-b border-white/40">
          <div className="flex items-center gap-8"><button onClick={() => setShowNodeRed(true)} className="w-16 h-16 bg-emerald-500 rounded-3xl flex items-center justify-center shadow-lg border border-emerald-400 text-white hover:scale-105 transition-transform active:scale-95"><Zap size={32} fill="currentColor" /></button><div><h3 className="text-3xl font-black text-gray-900 tracking-tight">Energie Monitor</h3><div className="flex items-center gap-3 mt-1"><a href={VICTRON_VRM_URL} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-500 font-bold uppercase hover:underline flex items-center gap-1.5">Victron VRM <ExternalLink size={10} /></a><div className="w-1 h-1 bg-gray-200 rounded-full" /><span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Node-RED Stream</span></div></div></div>
          <button onClick={onClose} className="w-16 h-16 flex items-center justify-center bg-gray-900 hover:bg-black rounded-[2rem] transition-all text-white shadow-2xl active:scale-90 group"><X className="w-8 h-8 group-hover:rotate-90 transition-transform" /></button>
        </div>
        {showNodeRed && ( <div className="absolute inset-0 z-[300] bg-[#f0f0f0] flex flex-col animate-in slide-in-from-bottom-8"><div className="p-6 flex justify-between items-center bg-white border-b border-gray-200"><div className="flex items-center gap-4"><LayoutDashboard className="text-emerald-500" /><span className="font-black text-sm uppercase tracking-widest">Node-RED Full Control</span></div><button onClick={() => setShowNodeRed(false)} className="px-6 py-2 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest">Sluiten</button></div><iframe src={NODERED_DASHBOARD} className="flex-1 w-full border-none" /></div> )}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar border-r border-white/40">
            <div className="bg-white/80 rounded-[3rem] p-8 border border-white shadow-sm flex items-center gap-10">
              <VisualBattery soc={data.soc} status={data.batteryStatus} />
              <div className="flex-1 space-y-6">
                <div className="flex justify-between items-start"><span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em]">Systeemstatus</span><div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${data.batteryStatus.toLowerCase() === 'opladen' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-orange-100 border-orange-200 text-orange-700'}`}>{data.batteryStatus}</div></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100"><p className="text-[9px] font-black text-gray-400 uppercase mb-1">Battery Power</p><p className="text-2xl font-black text-gray-800">{batteryPowerDisplay}</p></div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100"><p className="text-[9px] font-black text-gray-400 uppercase mb-1">Netgebruik</p><p className="text-2xl font-black text-gray-800">{gridTotalDisplay}</p></div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 col-span-2"><p className="text-[9px] font-black text-gray-400 uppercase mb-1">Setpoint</p><p className="text-2xl font-black text-gray-800">{gridSetpointDisplay}</p></div>
                </div>
              </div>
            </div>
            <div className="bg-white/80 rounded-[3rem] p-8 border border-white shadow-sm relative overflow-hidden group"><div className="absolute top-8 right-8 w-32 h-20 opacity-20 transition-all duration-500 group-hover:opacity-100 group-hover:scale-110"><svg viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-xl"><path d="M10 30L15 15C15 15 25 5 50 5C75 5 85 15 85 15L90 30H10Z" fill="#ff0000" /><circle cx="20" cy="30" r="5" fill="#333" /><circle cx="80" cy="30" r="5" fill="#333" /></svg></div><div className="relative z-10"><span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] block mb-6 flex items-center gap-2"><Car size={16} className="text-blue-500"/> KIA EV9 Lader</span><div className="flex items-center gap-6 mb-8"><div className="bg-blue-600 p-8 rounded-[2rem] text-white shadow-lg shadow-blue-100"><p className="text-[10px] font-black uppercase opacity-60 mb-1">Vermogen</p><p className="text-4xl font-black">{evPowerDisplay}</p></div><div className="flex-1 grid grid-cols-2 gap-4"><div className="bg-gray-50 p-4 rounded-2xl border border-gray-100"><p className="text-[9px] font-black text-gray-400 uppercase mb-1">Vandaag</p><p className="text-2xl font-black text-gray-800">{evChargedTodayDisplay}</p></div><div className="bg-gray-50 p-4 rounded-2xl border border-gray-100"><p className="text-[9px] font-black text-gray-400 uppercase mb-1">Deze Maand</p><p className="text-2xl font-black text-gray-800">{evChargedMonthDisplay}</p></div></div></div><div className="flex justify-end pt-2 border-t border-gray-100"><span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{evTotalCounterDisplay}</span></div></div></div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
            <div className="bg-white/80 rounded-[3rem] p-8 border border-white shadow-sm"><span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] block mb-6 flex items-center gap-2"><Sun size={14} className="text-amber-500"/> Zonne-energie</span><div className="p-10 bg-amber-50 rounded-[2.5rem] border border-amber-100 mb-6"><p className="text-[10px] font-black text-amber-600 uppercase mb-1">Huidige Opbrengst</p><p className="text-6xl font-black text-amber-700">{solarTotalDisplay}</p><div className="flex gap-4 mt-3"><span className="text-[9px] font-bold text-amber-500 uppercase">{solarACDisplay}</span><span className="text-[9px] font-bold text-amber-500 uppercase">{solarDCDisplay}</span></div></div><div className="grid grid-cols-2 gap-4"><div className="p-4 bg-gray-50 rounded-2xl text-center border border-gray-100"><p className="text-[9px] font-black text-gray-400 uppercase mb-1">Totaal Vandaag</p><p className="text-3xl font-black text-gray-800">{solarTotalDayDisplay}</p></div><div className="p-4 bg-gray-900 rounded-2xl text-center text-white"><p className="text-[9px] font-black text-gray-400 uppercase mb-1">DC Day</p><p className="text-3xl font-black text-white">{solarDCDayDisplay}</p></div></div></div>
            <div className="bg-blue-600 rounded-[3rem] p-8 text-white relative overflow-hidden shadow-xl shadow-blue-100"><Sparkles className="absolute -top-10 -right-10 w-48 h-48 opacity-10" /><div className="relative z-10"><span className="text-[11px] font-black uppercase tracking-[0.4em] opacity-60 block mb-6">Solar Forecast</span><div className="flex items-baseline gap-4 mb-6"><p className="text-8xl font-black tracking-tighter">{data.forecastPrediction}</p><span className="text-2xl font-black opacity-40">kWh</span></div><div className="px-6 py-3 bg-white/10 rounded-2xl border border-white/10 text-lg font-bold">{data.forecastSummary}</div></div></div>
          </div>
        </div>
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
              <Cloud className="w-8 h-8 text-blue-500" />
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

const GooglePhotosWidget = ({ accessToken, grantedScopes, onForceLogout, onReAuth }: { accessToken: string | null, grantedScopes: string, onForceLogout: () => void, onReAuth: () => void }) => {
  const [photos, setPhotos] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{status: string, message: string} | null>(null);

  const fetchPhotos = async () => {
    if (!accessToken) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50', {
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      const data = await response.json();
      if (data.error) {
        setError({
          status: data.error.status || "UNKNOWN",
          message: data.error.message || "Onbekende fout van Google Photos API."
        });
      } else if (data.mediaItems && data.mediaItems.length > 0) {
        setPhotos(data.mediaItems);
      } else { 
        setError({status: "EMPTY", message: "Geen foto's gevonden in je bibliotheek."}); 
      }
    } catch (e: any) { 
      setError({status: "FETCH_ERROR", message: "Netwerkfout bij ophalen van foto's."}); 
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPhotos(); }, [accessToken]);
  useEffect(() => {
    if (photos.length === 0) return;
    const interval = setInterval(() => { setCurrentIndex(prev => (prev + 1) % photos.length); }, 10000);
    return () => clearInterval(interval);
  }, [photos]);

  if (loading) return ( <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col h-full items-center justify-center"><Loader2 className="w-12 h-12 text-blue-400 animate-spin" /><p className="mt-4 text-xs font-black text-gray-400 uppercase tracking-widest">Foto's laden...</p></div> );

  if (error) return (
    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex flex-col h-full items-center justify-center text-center overflow-y-auto no-scrollbar">
      <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mb-6"><ShieldAlert size={40} className="text-rose-400" /></div>
      <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight mb-2">Google Photos Toegangsfout</h3>
      
      <div className="w-full max-w-md bg-gray-50 p-6 rounded-3xl mb-8 border border-gray-100 text-left space-y-4">
         <div>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Fout Status:</p>
           <p className="text-rose-600 text-sm font-bold">{error.status}</p>
         </div>
         <div>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Gekregen Rechten (Scopes):</p>
           <p className="text-gray-500 text-[10px] font-mono break-all leading-tight bg-white p-2 border border-gray-100 rounded-lg">
             {grantedScopes || "Geen scopes gevonden"}
           </p>
           {!grantedScopes.includes("photoslibrary.readonly") && (
             <p className="text-[10px] text-rose-500 font-bold mt-1 uppercase">⚠️ Photos scope ontbreekt!</p>
           )}
         </div>
         <p className="text-gray-600 text-sm leading-relaxed">{error.message}</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button onClick={onReAuth} className="px-8 py-5 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl">
          <RefreshCw size={16} /> Re-authenticate with Full Scopes
        </button>
        <button onClick={onForceLogout} className="px-8 py-5 bg-gray-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3">
          <LogOut size={16} /> Log Uit
        </button>
      </div>

      <div className="mt-10 p-6 bg-blue-50 rounded-3xl text-left border border-blue-100">
        <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-2"><Info size={14} /> Belangrijke Tips:</p>
        <ul className="text-[11px] text-blue-800 space-y-2 leading-relaxed list-disc ml-4">
          <li><b>API Enabled:</b> Zorg dat de "Photos Library API" is ingeschakeld in je GCP Console.</li>
          <li><b>Test Users:</b> Ga naar Google Cloud Console &rarr; OAuth Consent Screen en voeg je e-mail toe aan de <b>"Test Users"</b> lijst.</li>
          <li><b>Checkbox:</b> Vink bij het inloggen expliciet het vakje <i>"View your Google Photos library"</i> aan.</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className="bg-black rounded-[3rem] shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden relative group">
      {photos.map((photo, idx) => ( <div key={photo.id} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === currentIndex ? 'opacity-100' : 'opacity-0'}`}><img src={photo.baseUrl + '=w1920-h1080'} alt="" className="w-full h-full object-cover" /></div> ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
      <div className="absolute bottom-10 left-10 text-white flex flex-col gap-1"><span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Google Photos</span><span className="text-xs font-bold truncate max-w-sm">{photos[currentIndex]?.filename}</span></div>
      <div className="absolute top-10 right-10 flex gap-4"><button onClick={fetchPhotos} className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white hover:bg-white/40 transition-colors"><RefreshCw size={18} /></button><div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white"><ImageIcon size={20} /></div></div>
    </div>
  );
};

const Calendar = ({ accessToken, items, isLoading, onRefresh, isCollapsed, onToggleCollapse }: { accessToken: string | null; items: AgendaItem[]; isLoading: boolean; onRefresh: () => void; isCollapsed: boolean; onToggleCollapse: () => void; }) => {
  const [selectedTimezone, setSelectedTimezone] = useState<string>('Europe/Brussels');
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  
  const getEventsForDay = (date: Date) => {
    // Current date string in the target timezone (e.g., "2023-10-23")
    const dayStr = date.toLocaleDateString('en-CA', { timeZone: selectedTimezone });
    
    return items.filter(item => { 
      if (item.isAllDay && item.allDayStartStr && item.allDayEndStr) {
        // Google all-day end dates are exclusive.
        // If Oct 23 is all day: Start="2023-10-23", End="2023-10-24"
        return dayStr >= item.allDayStartStr && dayStr < item.allDayEndStr;
      }
      
      // For timed events, we check if the event spans any part of the requested day in the target timezone
      const startDayStr = item.start.toLocaleDateString('en-CA', { timeZone: selectedTimezone });
      const endDayStr = new Date(item.end.getTime() - 1).toLocaleDateString('en-CA', { timeZone: selectedTimezone });
      return dayStr >= startDayStr && dayStr <= endDayStr;
    });
  };

  const toggleTimezone = () => {
    setSelectedTimezone(prev => prev === 'UTC' ? 'Europe/Brussels' : 'UTC');
  };

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
          <div className="text-[11px] font-black text-gray-300 uppercase tracking-[0.4em]">Komende 7 dagen</div>
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
                const today = new Date().toDateString() === date.toDateString(); 
                return ( 
                  <div key={idx} className={`bg-white flex flex-col min-w-0 ${today ? 'bg-blue-50/20' : ''}`}>
                    <div className={`p-6 text-center border-b border-gray-50 shrink-0 ${today ? 'bg-blue-500/5' : ''}`}>
                      <div className={`text-[11px] font-black tracking-widest ${today ? 'text-blue-600' : 'text-gray-400'}`}>
                        {date.toLocaleDateString('nl-BE', { weekday: 'short' }).toUpperCase()}
                      </div>
                      <div className={`text-3xl font-black mt-1 ${today ? 'text-blue-600' : 'text-gray-800'}`}>{date.getDate()}</div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-0 space-y-0.5 no-scrollbar">
                      {dayEvents.sort((a,b) => (a.isAllDay ? -1 : 1) - (b.isAllDay ? -1 : 1)).map(item => ( 
                        <div 
                          key={item.id + date.toISOString()} 
                          onClick={() => window.open(item.htmlLink, '_blank')} 
                          style={item.isAllDay ? { backgroundColor: item.color || '#9ca3af' } : {}} 
                          className={`w-full cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all ${
                            item.isAllDay 
                              ? 'p-0.5 rounded-sm shadow-sm border border-black/5' 
                              : 'px-0.5 py-1 bg-transparent'
                          }`}
                        >
                          <div className={`flex flex-col ${!item.isAllDay ? 'text-black' : 'text-white'}`}>
                            {!item.isAllDay && (
                              <span className="text-[24px] font-black opacity-40 leading-none tabular-nums uppercase pl-1">
                                {item.start.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: selectedTimezone })}
                                {' - '}
                                {item.end.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: selectedTimezone })}
                              </span>
                            )}
                            <span className="text-[30px] font-bold leading-tight line-clamp-2 pl-1 pr-1">
                              {item.title}
                            </span>
                          </div>
                        </div> 
                      ))} 
                    </div>
                  </div> 
                ); 
              })}
            </div> 
          )}
        </div> 
      )}
    </div>
  );
};

const TaskWidget = () => (
  <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1"><span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] block mb-6">Takenlijst</span><div className="space-y-4">{[{ label: 'Check Meteo Herenthout', time: '09:00' }, { label: 'Node-RED Monitor', time: '11:30' }, { label: 'Hub Onderhoud', time: '20:00' }].map((task, i) => ( <div key={i} className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl transition-colors cursor-pointer group"><div className="w-8 h-8 rounded-xl border-2 border-gray-100 group-hover:border-blue-400 transition-colors" /><div className="flex-1"><div className="text-sm font-bold text-gray-700">{task.label}</div><div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{task.time}</div></div></div> ))}</div></div>
);

const EnergyWidget = ({ data, error, onClick }: { data: EnergyData | null, error: string | null, onClick: () => void }) => {
  return (
    <button onClick={onClick} className="w-full p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 text-left hover:border-emerald-400 hover:shadow-xl transition-all active:scale-[0.98] overflow-hidden">
      <div className="flex justify-between items-center mb-6"><span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2"><Zap size={10} className="text-emerald-500" /> Energie Status</span>{error ? (<span className="text-[9px] font-black text-rose-500 uppercase flex items-center gap-1"><AlertTriangle size={10}/> {error}</span>) : (<span className="text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1"><CheckCircle2 size={10}/> LIVE</span>)}</div>
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1">
            <p className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Huis Verbruik</p>
            <div className="flex items-baseline gap-2">
              <p className="text-7xl font-black text-gray-900 leading-none tracking-tighter tabular-nums">{data ? data.houseLoad : '---'}</p>
              <span className="text-2xl font-bold text-gray-300">W</span>
            </div>
            {/* Grid data moved under House Load */}
            <div className="flex items-center gap-2 mt-4 opacity-60">
              <UtilityPole size={16} className="text-blue-400" />
              <span className="text-sm font-black text-gray-500 uppercase tracking-widest">Net: {data ? data.gridTotal + 'W' : '--W'}</span>
            </div>
          </div>
          <div className="space-y-5 border-l border-gray-100 pl-8">
            <div className="flex items-center gap-4">
              <Sun size={24} className="text-amber-400" />
              <span className="text-2xl font-black text-gray-800 tabular-nums">{data ? data.solarTotal + 'W' : '--W'}</span>
            </div>
            {/* New Car icon location with grid.dc_power */}
            <div className="flex items-center gap-4">
              <Car size={24} className="text-blue-500" />
              <span className="text-2xl font-black text-gray-800 tabular-nums">{data ? data.dcPower + 'W' : '--W'}</span>
            </div>
            <div className="flex items-center gap-4">
              <BatteryIcon size={24} className="text-emerald-500" />
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-gray-800 tabular-nums">{data ? data.batteryPower + 'W' : '--W'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-gray-50 pt-8">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Batterij</span>
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-5 border-2 border-emerald-400 rounded-[2px] relative flex items-end">
                <div className="w-full bg-emerald-400" style={{ height: (data?.soc || 0) + '%' }} />
              </div>
              <span className="text-2xl font-black text-gray-900 tabular-nums">{data ? data.soc + '%' : '--%'}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-right">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Zon Forecast</span>
            <div className="flex items-center justify-end gap-2">
              <span className={'text-2xl font-black tabular-nums text-gray-900'}>{data ? Math.round(data.forecastPrediction) + ' kWh' : '--'}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
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
  const [energyError, setEnergyError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const tokenClientRef = useRef<any>(null);

  const handleLogout = () => { 
    localStorage.removeItem('hub_access_token'); 
    localStorage.removeItem('hub_granted_scopes');
    localStorage.removeItem(USER_CACHE_KEY); 
    setAccessToken(null); 
    setGrantedScopes("");
    setUser(null); 
    setAgendaItems([]); 
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
               await fetchUserProfile(response.access_token); 
               await fetchCalendarEvents(response.access_token); 
            }
            setIsSyncing(false);
          },
        });
        if (accessToken) { 
          fetchUserProfile(accessToken).catch(() => handleLogout()); 
          fetchCalendarEvents(accessToken).catch(() => handleLogout()); 
        }
      } else { setTimeout(initGsi, 500); }
    };
    initGsi(); startEnergySync(); if (!weatherData) fetchWeatherForecast(false);
    return () => { clearInterval(clockTimer); document.removeEventListener('fullscreenchange', fullscreenHandler); };
  }, []);

  const fetchUserProfile = async (token: string) => { 
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } }); if (resp.status === 401) { handleLogout(); return; }
    const data = await resp.json(); setUser({ name: data.name, picture: data.picture }); 
  };
  
  const fetchCalendarEvents = async (token: string) => { 
    setAgendaLoading(true); 
    try { 
      const now = new Date(); const start = new Date(now); start.setHours(0,0,0,0); const end = new Date(now); end.setDate(now.getDate() + 30); 
      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + start.toISOString() + '&timeMax=' + end.toISOString() + '&singleEvents=true&orderBy=startTime', { headers: { Authorization: 'Bearer ' + token } });
      const data = await resp.json(); 
      if (data.items) { 
        const mapped = data.items.map((event: any) => { 
          const isAllDay = !event.start.dateTime; 
          const startRaw = event.start.dateTime || event.start.date; 
          const endRaw = event.end.dateTime || event.end.date;

          // For all-day events, anchor to midnight in local time so Date conversion is stable
          const startDate = isAllDay ? new Date(startRaw + 'T00:00:00') : new Date(startRaw);
          const endDate = isAllDay ? new Date(endRaw + 'T00:00:00') : new Date(endRaw);
          
          return { 
            id: event.id, 
            start: startDate, 
            end: endDate, 
            title: event.summary || '(Geen titel)', 
            color: GOOGLE_COLOR_MAP[event.colorId] || '#10b981', 
            isAllDay, 
            htmlLink: event.htmlLink,
            allDayStartStr: isAllDay ? startRaw : undefined, // "YYYY-MM-DD"
            allDayEndStr: isAllDay ? endRaw : undefined     // "YYYY-MM-DD" exclusive
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
  const startEnergySync = () => { setInterval(async () => { try { const resp = await fetch(ENERGY_ENDPOINT); const data = await resp.json(); setEnergyData({ houseLoad: data.grid?.ac_power?.value || 0, evPower: data.ev?.current_power?.value || 0, evChargedToday: data.ev?.charged_today?.value || 0, evChargedMonth: data.ev?.charged_month?.value || 0, evTotalCounter: data.ev?.total_counter?.value || 0, evStatus: data.ev?.status?.value || 'Idle', solarTotal: data.solar?.total_power?.value || 0, solarAC: data.solar?.ac_pv_power?.value || 0, solarDC: data.solar?.dc_pv_power?.value || 0, solarDCDay: data.solar?.dc_pv_total?.value || 0, solarACDay: data.solar?.ac_pv_totalday?.value || 0, solarTotalDay: data.solar?.total_powerday?.value || 0, gridTotal: data.grid?.total_power?.value || 0, gridSetpoint: data.grid?.setpoint?.value || 0, dcPower: data.grid?.dc_power?.value || 0, soc: data.battery?.soc?.value || 0, batteryStatus: data.battery?.status?.value || 'Idle', batteryPower: data.battery?.power?.value || 0, forecastPrediction: parseFloat(data.forecast?.prediction?.value || "0"), forecastSummary: data.forecast?.summary?.value || 'Laden...', timestamp: new Date().toISOString() }); setEnergyError(null); } catch (e) { setEnergyError("Geen verbinding"); } }, 2000); };

  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col animate-in fade-in">
      <header className="w-full px-[50px] pt-16 pb-4 flex flex-col md:flex-row md:items-end justify-between shrink-0">
        <div className="flex flex-col md:flex-row items-center md:items-baseline gap-16 text-left">
          <div className="flex flex-col"><div className="text-[7rem] sm:text-[9rem] font-black tracking-tighter text-gray-900 leading-[0.8] tabular-nums">{currentDate.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</div><div className="flex items-center gap-6 mt-6 px-2"><CalendarIcon className="w-6 h-6 text-gray-200" /><p className="text-gray-400 text-sm uppercase tracking-[0.5em] font-black">{currentDate.toLocaleDateString('nl-BE', { weekday: 'long', month: 'long', day: 'numeric' })}</p></div></div>
          <h1 className="text-5xl sm:text-7xl font-extralight tracking-tighter text-gray-300 leading-none">{currentDate.getHours() < 12 ? 'Goedemorgen' : currentDate.getHours() < 18 ? 'Goedemiddag' : 'Goedenavond'}</h1>
        </div>
        <div className="mt-10 md:mt-0 flex flex-col items-end gap-10">
          <div className="flex items-center gap-10">
            {accessToken && ( <button onClick={() => setActiveMainView(activeMainView === 'agenda' ? 'photos' : 'agenda')} className={'w-16 h-16 border rounded-[2rem] shadow-xl flex items-center justify-center transition-all ' + (activeMainView === 'photos' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-gray-100 text-gray-400 hover:text-gray-900')}>{activeMainView === 'agenda' ? <ImageIcon size={24} /> : <CalendarIcon size={24} />}</button> )}
            <button onClick={toggleFullScreen} className="w-16 h-16 bg-white border border-gray-100 rounded-[2rem] shadow-xl flex items-center justify-center text-gray-400 hover:text-gray-900">{isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}</button>
            {!accessToken ? (<button onClick={() => handleLogin()} disabled={isSyncing} className="px-12 py-6 bg-gray-900 text-white rounded-[2.5rem] text-[13px] font-black uppercase tracking-widest shadow-2xl">Google Sync</button>) : ( <div className="flex items-center gap-8 bg-white p-4 pr-10 rounded-[2.5rem] border border-gray-100 shadow-xl cursor-pointer" onClick={handleLogout}><div className="w-16 h-16 bg-gray-100 rounded-3xl overflow-hidden border border-gray-50"><img src={user?.picture} alt="" className="w-full h-full object-cover" /></div><div className="text-right"><div className="text-[13px] font-black text-gray-900 uppercase tracking-widest">{user?.name}</div><div className="text-[10px] text-green-500 font-bold flex items-center justify-end gap-2 mt-1"><CheckCircle2 size={12}/> ONLINE</div></div></div> )}
            <WeatherWidget data={weatherData} onClick={() => fetchWeatherForecast(true)} isRefreshing={weatherLoading} />
          </div>
          <div className="text-[12px] font-black text-gray-300 uppercase tracking-[0.5em]">HERENTHOUT, BELGIË</div>
        </div>
      </header>
      <main className="w-full px-[50px] pt-3 pb-10 grid grid-cols-1 xl:grid-cols-10 gap-10 flex-1 overflow-hidden">
        <section className="xl:col-span-7 h-full">{activeMainView === 'agenda' ? ( <Calendar accessToken={accessToken} items={agendaItems} isLoading={agendaLoading} onRefresh={() => accessToken && fetchCalendarEvents(accessToken)} isCollapsed={isAgendaCollapsed} onToggleCollapse={() => setIsAgendaCollapsed(!isAgendaCollapsed)} /> ) : ( <GooglePhotosWidget accessToken={accessToken} grantedScopes={grantedScopes} onForceLogout={handleLogout} onReAuth={() => handleLogin(true)} /> )}</section>
        <aside className="xl:col-span-3 space-y-10 flex flex-col h-full overflow-y-auto no-scrollbar"><EnergyWidget data={energyData} error={energyError} onClick={() => setIsEnergyOpen(true)} /><TimerWidget /><GeminiAssistantWidget /><TaskWidget /></aside>
      </main>
      {isWeatherOpen && <WeatherOverlay onClose={() => setIsWeatherOpen(false)} weatherData={weatherData} loading={weatherLoading} />}
      {isEnergyOpen && <EnergyOverlay data={energyData} onClose={() => setIsEnergyOpen(false)} />}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
