import React, { useState, useEffect } from 'react';
import { 
  Music, SkipBack, Play, SkipForward, Pause, Volume2, 
  Settings, X, Loader2, AlertTriangle, RefreshCw, Speaker,
  ChevronUp, ChevronDown
} from 'lucide-react';

// TypeScript interfaces
interface SonosPlayback {
  isPlaying: boolean;
  track: string | null;
  artist: string | null;
  album: string | null;
  albumArt: string | null;
  position: number;
  duration: number;
  volume: number;
  playerName: string | null;
  timestamp?: string;
}

interface SonosWidgetProps {
  nodeRedBaseUrl: string; // e.g., "https://100.74.104.126:1881"
}

export const SonosWidget: React.FC<SonosWidgetProps> = ({ nodeRedBaseUrl }) => {
  const [playback, setPlayback] = useState<SonosPlayback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [localPosition, setLocalPosition] = useState(0);

  // Endpoints
  const NOW_PLAYING_URL = `${nodeRedBaseUrl}/sonosnowplaying`;
  const PAUSE_URL = `${nodeRedBaseUrl}/sonospause`;
  const PLAY_URL = `${nodeRedBaseUrl}/sonosplay`;
  const NEXT_URL = `${nodeRedBaseUrl}/sonosnext`;
  const PREVIOUS_URL = `${nodeRedBaseUrl}/sonosprevious`;
  const VOLUME_URL = `${nodeRedBaseUrl}/sonosvolume`;
  const AUTH_URL = `${nodeRedBaseUrl}/sonosauth`;

  // Fetch current playback state
  const fetchNowPlaying = async () => {
    try {
      const response = await fetch(NOW_PLAYING_URL);
      const data = await response.json();

      if (response.status === 401) {
        setIsAuthenticated(false);
        setError("Niet geauthenticeerd. Klik op Settings om in te loggen.");
        setLoading(false);
        return;
      }

      if (data.error) {
        setError(data.message || "Fout bij ophalen van data");
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);
      setPlayback(data);
      setLocalPosition(data.position);
      setError(null);
      setLoading(false);
    } catch (err: any) {
      setError("Kan geen verbinding maken met Node-RED");
      setLoading(false);
    }
  };

  // Playback control functions
  const togglePlayPause = async () => {
    if (!playback) return;

    try {
      const url = playback.isPlaying ? PAUSE_URL : PLAY_URL;
      const response = await fetch(url, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        setPlayback(prev => prev ? { ...prev, isPlaying: !prev.isPlaying } : null);
        setTimeout(fetchNowPlaying, 500);
      }
    } catch (err) {
      console.error("Play/Pause error:", err);
    }
  };

  const skipNext = async () => {
    try {
      const response = await fetch(NEXT_URL, { method: 'POST' });
      if (response.ok) {
        setTimeout(fetchNowPlaying, 500);
      }
    } catch (err) {
      console.error("Skip next error:", err);
    }
  };

  const skipPrevious = async () => {
    try {
      const response = await fetch(PREVIOUS_URL, { method: 'POST' });
      if (response.ok) {
        setTimeout(fetchNowPlaying, 500);
      }
    } catch (err) {
      console.error("Skip previous error:", err);
    }
  };

  const setVolume = async (newVolume: number) => {
    // Clamp volume between 0 and 100
    const clampedVolume = Math.max(0, Math.min(100, newVolume));
    
    try {
      const response = await fetch(VOLUME_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: clampedVolume })
      });

      if (response.ok) {
        // Optimistically update local state
        setPlayback(prev => prev ? { ...prev, volume: clampedVolume } : null);
        // Refresh to get actual state
        setTimeout(fetchNowPlaying, 300);
      }
    } catch (err) {
      console.error("Volume change error:", err);
    }
  };

  const volumeUp = () => {
    if (playback) {
      setVolume(playback.volume + 1);
    }
  };

  const volumeDown = () => {
    if (playback) {
      setVolume(playback.volume - 1);
    }
  };

  const handleAuthenticate = () => {
    window.open(AUTH_URL, '_blank');
    setShowSettings(false);
    
    setTimeout(() => {
      fetchNowPlaying();
    }, 3000);
  };

  // Poll for updates every 5 seconds
  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update position bar in real-time (every second when playing)
  useEffect(() => {
    if (!playback || !playback.isPlaying) return;

    const progressInterval = setInterval(() => {
      setLocalPosition(prev => {
        const newPosition = prev + 1000;
        return newPosition > playback.duration ? playback.duration : newPosition;
      });
    }, 1000);

    return () => clearInterval(progressInterval);
  }, [playback?.isPlaying, playback?.duration]);

  // Format time (ms to mm:ss)
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
            Sonos laden...
          </p>
        </div>
      </div>
    );
  }

  // Error / Not authenticated state
  if (error || !isAuthenticated) {
    return (
      <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2">
            <Speaker size={10} className="text-blue-500" /> Sonos
          </span>
          <button 
            onClick={() => setShowSettings(true)} 
            className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:text-blue-500 transition-colors"
          >
            <Settings size={14} />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-6">
          <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center">
            <AlertTriangle className="text-rose-400 w-8 h-8" />
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
              {error || "Authenticatie vereist"}
            </p>
            <p className="text-[10px] text-gray-300 leading-relaxed max-w-xs">
              Klik op Settings om in te loggen met je Sonos account via Node-RED.
            </p>
          </div>
          <button 
            onClick={() => setShowSettings(true)} 
            className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 active:scale-95 transition-all"
          >
            Inloggen
          </button>
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center animate-in fade-in duration-300 bg-white/95 backdrop-blur-3xl p-10">
            <div className="bg-white w-full max-w-2xl p-16 rounded-[4rem] shadow-2xl border border-gray-100 flex flex-col">
              <div className="flex justify-between items-center w-full mb-10">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center">
                    <Speaker size={32} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 uppercase tracking-widest">
                    Sonos Authenticatie
                  </h3>
                </div>
                <button 
                  onClick={() => setShowSettings(false)} 
                  className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-8 mb-12">
                <p className="text-sm text-gray-500 leading-relaxed">
                  Om Sonos te gebruiken moet je eerst authenticeren via Node-RED. 
                  Dit proces wordt maar één keer uitgevoerd en je tokens worden veilig opgeslagen.
                </p>

                <div className="w-full p-8 bg-blue-50 rounded-[2rem] border border-blue-100">
                  <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-[0.2em] mb-4">
                    Wat gebeurt er?
                  </h4>
                  <ol className="space-y-3 text-[11px] text-blue-600 font-medium leading-relaxed">
                    <li className="flex gap-3">
                      <span className="font-black">1.</span>
                      <span>Je wordt doorverwezen naar Sonos's login pagina</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-black">2.</span>
                      <span>Log in met je Sonos account</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-black">3.</span>
                      <span>Accepteer de gevraagde permissies</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-black">4.</span>
                      <span>Je wordt teruggestuurd en de widget werkt automatisch</span>
                    </li>
                  </ol>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleAuthenticate}
                  className="w-full py-8 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black text-lg uppercase tracking-[0.2em] shadow-xl shadow-blue-100 transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                  <Speaker size={20} /> Inloggen met Sonos
                </button>
                <button 
                  onClick={() => setShowSettings(false)} 
                  className="w-full py-6 text-gray-400 hover:text-gray-900 text-xs font-black uppercase tracking-widest transition-colors"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Nothing playing state
  if (!playback?.track) {
    return (
      <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1 flex flex-col transition-all hover:border-blue-200">
        <div className="flex justify-between items-center mb-6">
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2">
            <Speaker size={10} className="text-blue-500" /> Sonos
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                Verbonden
              </span>
            </div>
            <button 
              onClick={fetchNowPlaying}
              className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:text-blue-500 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-6">
            <Pause className="text-gray-300 w-8 h-8" />
          </div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
            Niets aan het afspelen
          </p>
          <p className="text-[10px] text-gray-300 mt-2">
            Start muziek op Sonos
          </p>
        </div>
      </div>
    );
  }

  // Active playback state
  const progressPercentage = (localPosition / playback.duration) * 100;

  return (
    <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1 flex flex-col transition-all hover:border-blue-200 relative">
      <div className="flex justify-between items-center mb-6">
        <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2">
          <Speaker size={10} className="text-blue-500" /> Sonos
        </span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${playback.isPlaying ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              {playback.playerName || 'Sonos'}
            </span>
          </div>
          <button 
            onClick={fetchNowPlaying}
            className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:text-blue-500 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-between gap-8">
        {/* Left side: Album art and track info */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          {/* Album Art */}
          <div className="relative group">
            <div className="w-40 h-40 bg-gray-100 rounded-[2.5rem] overflow-hidden shadow-2xl transition-transform group-hover:scale-105 duration-500">
              {playback.albumArt ? (
                <img 
                  src={playback.albumArt} 
                  alt={playback.album || 'Album'} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-blue-600">
                  <Speaker size={48} className="text-white/50" />
                </div>
              )}
            </div>
          </div>

          {/* Track Info */}
          <div className="text-center w-full px-4">
            <h4 className="text-xl font-black text-gray-800 tracking-tight truncate">
              {playback.track}
            </h4>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1 truncate">
              {playback.artist}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full space-y-3 px-4">
            <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-400 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-black text-gray-300 tabular-nums">
              <span>{formatTime(localPosition)}</span>
              <span>{formatTime(playback.duration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center gap-10 text-gray-400">
            <button 
              onClick={skipPrevious}
              className="hover:text-blue-500 transition-colors active:scale-90"
            >
              <SkipBack size={24} fill="currentColor" />
            </button>
            
            <button 
              onClick={togglePlayPause}
              className="w-14 h-14 bg-gray-900 text-white rounded-2xl flex items-center justify-center hover:bg-black transition-all active:scale-90 shadow-xl"
            >
              {playback.isPlaying ? (
                <Pause size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" className="ml-1" />
              )}
            </button>
            
            <button 
              onClick={skipNext}
              className="hover:text-blue-500 transition-colors active:scale-90"
            >
              <SkipForward size={24} fill="currentColor" />
            </button>
          </div>
        </div>

        {/* Right side: Volume controls */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={volumeUp}
            className="w-12 h-12 bg-gray-50 text-gray-400 rounded-xl hover:bg-blue-50 hover:text-blue-500 transition-all active:scale-90 flex items-center justify-center"
          >
            <ChevronUp size={20} />
          </button>
          
          <div className="flex flex-col items-center gap-2">
            <Volume2 size={20} className="text-blue-500" />
            <span className="text-2xl font-black text-gray-800 tabular-nums">
              {playback.volume}
            </span>
          </div>
          
          <button
            onClick={volumeDown}
            className="w-12 h-12 bg-gray-50 text-gray-400 rounded-xl hover:bg-blue-50 hover:text-blue-500 transition-all active:scale-90 flex items-center justify-center"
          >
            <ChevronDown size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
