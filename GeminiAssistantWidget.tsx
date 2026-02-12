import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, AlertTriangle, Sparkles, Terminal, Save
} from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

interface GeminiAssistantWidgetProps {}

export const GeminiAssistantWidget: React.FC<GeminiAssistantWidgetProps> = () => {
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [geminiConnected, setGeminiConnected] = useState(false);
  const [geminiListening, setGeminiListening] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiResponse, setGeminiResponse] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(!geminiApiKey);
  const [tempApiKey, setTempApiKey] = useState('');

  const genaiClientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const initGemini = async () => {
    if (!geminiApiKey) {
      setGeminiError("Geen API key ingesteld");
      return;
    }

    try {
      const client = new GoogleGenAI({ apiKey: geminiApiKey });
      genaiClientRef.current = client;
      setGeminiConnected(true);
      setGeminiError(null);
    } catch (err: any) {
      setGeminiError("Initialisatie mislukt: " + err.message);
      setGeminiConnected(false);
    }
  };

  const startLiveSession = async () => {
    if (!genaiClientRef.current) {
      setGeminiError("Client niet geïnitialiseerd");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const session = await genaiClientRef.current.live.connect("models/gemini-2.0-flash-exp", {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: Modality.AUDIO,
        },
        systemInstruction: {
          parts: [{ text: `Je bent een hulpvaardige stem-assistent voor een slim-huis dashboard. Spreek Nederlands. Antwoord kort en bondig. Je doel is om de gebruiker snel te helpen met vragen over het huis, agenda, energie, weer, etc. Wees vriendelijk en behulpzaam.` }]
        }
      });

      sessionRef.current = session;

      session.on('content', (msg: LiveServerMessage) => {
        if (msg.serverContent?.modelTurn?.parts) {
          let text = '';
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.text) text += part.text;
          }
          setGeminiResponse(prev => prev + text);
        }
        if (msg.serverContent?.turnComplete) {
          console.log("Turn complete");
        }
      });

      session.on('error', (err: any) => {
        setGeminiError("Sessie fout: " + err.message);
        setGeminiListening(false);
      });

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        session.send({ realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm", data: btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer))) }] } });
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setGeminiListening(true);
      setGeminiError(null);
    } catch (err: any) {
      setGeminiError("Microfoon toegang geweigerd: " + err.message);
      setGeminiListening(false);
    }
  };

  const stopLiveSession = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.disconnect();
      sessionRef.current = null;
    }
    setGeminiListening(false);
  };

  const handleToggleListening = () => {
    if (geminiListening) {
      stopLiveSession();
    } else {
      setGeminiResponse('');
      startLiveSession();
    }
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('gemini_api_key', tempApiKey);
    setGeminiApiKey(tempApiKey);
    setShowApiKeyInput(false);
    setTempApiKey('');
  };

  useEffect(() => {
    if (geminiApiKey) {
      initGemini();
    }
  }, [geminiApiKey]);

  useEffect(() => {
    return () => {
      if (geminiListening) stopLiveSession();
    };
  }, []);

  return (
    <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-xl relative overflow-hidden h-[420px] flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 pointer-events-none" />
      
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Gemini Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          {geminiConnected && (
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
          {geminiError && (
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          )}
        </div>
      </div>

      {showApiKeyInput ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 relative z-10">
          <div className="text-center mb-4">
            <p className="text-sm font-bold text-gray-600 mb-2">Voer je Gemini API Key in</p>
            <p className="text-xs text-gray-400">Krijg je key op: ai.google.dev</p>
          </div>
          <div className="w-full max-w-md">
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="API Key..."
              className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <button
            onClick={handleSaveApiKey}
            disabled={!tempApiKey}
            className="px-8 py-4 bg-purple-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save size={16} />
            Opslaan
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto mb-6 relative z-10">
            {geminiResponse ? (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
                <div className="flex items-start gap-3 mb-3">
                  <Terminal className="w-4 h-4 text-purple-600 mt-1 flex-shrink-0" />
                  <p className="text-xs font-bold text-purple-900 uppercase tracking-wider">Response</p>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{geminiResponse}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-30">
                <Mic size={48} className="text-gray-400 mb-4" />
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center">
                  {geminiListening ? 'Aan het luisteren...' : 'Klik op de microfoon om te beginnen'}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleToggleListening}
            disabled={!geminiConnected}
            className={`w-full py-6 rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 relative z-10 ${
              geminiListening
                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/50'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg hover:shadow-purple-500/50'
            } ${!geminiConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {geminiListening ? (
              <>
                <MicOff size={20} />
                Stop Luisteren
              </>
            ) : (
              <>
                <Mic size={20} />
                Start Luisteren
              </>
            )}
          </button>

          {geminiError && (
            <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl relative z-10">
              <p className="text-xs text-rose-600 flex items-center gap-2">
                <AlertTriangle size={14} />
                {geminiError}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
