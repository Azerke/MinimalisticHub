import React, { useState, useEffect } from 'react';
import { 
  Music, SkipBack, Play, SkipForward, Pause, Volume2, 
  Settings, X, Loader2, AlertTriangle, RefreshCw
} from 'lucide-react';

// TypeScript interfaces
interface SpotifyPlayback {
  isPlaying: boolean;
  track: string | null;
  artist: string | null;
  album: string | null;
  albumArt: string | null;
  progress: number;
  duration: number;
  device: string | null;
  timestamp?: string;
}

interface SpotifyWidgetProps {
  nodeRedBaseUrl: string; // e.g., "https://100.74.104.126:1881"
}

export const SpotifyWidget: React.FC<SpotifyWidgetProps> = ({ nodeRedBaseUrl }) => {
  const [playback, setPlayback] = useState<SpotifyPlayback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);

  // Endpoints
	const NOW_PLAYING_URL = `${nodeRedBaseUrl}/spotifynowplaying`;  // Let op: geen slash
	const PAUSE_URL = `${nodeRedBaseUrl}/spotifypause`;
	const PLAY_URL = `${nodeRedBaseUrl}/spotifyplay`;
	const NEXT_URL = `${nodeRedBaseUrl}/spotifynext`;
	const PREVIOUS_URL = `${nodeRedBaseUrl}/spotifyprevious`;
	const AUTH_URL = `${nodeRedBaseUrl}/spotifyauth`;

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
      setLocalProgress(data.progress);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pause: playback.isPlaying })
      });

      if (response.ok) {
        // Update local state immediately for responsiveness
        setPlayback(prev => prev ? { ...prev, isPlaying: !prev.isPlaying } : null);
        
        // Fetch fresh state after a short delay
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

  const handleAuthenticate = () => {
    window.open(AUTH_URL, '_blank');
    setShowSettings(false);
    
    // Check authentication after a few seconds
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

  // Update progress bar in real-time (every second when playing)
  useEffect(() => {
    if (!playback || !playback.isPlaying) return;

    const progressInterval = setInterval(() => {
      setLocalProgress(prev => {
        const newProgress = prev + 1000;
        return newProgress > playback.duration ? playback.duration : newProgress;
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
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
            Spotify laden...
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
            <Music size={10} className="text-emerald-500" /> Spotify
          </span>
          <button 
            onClick={() => setShowSettings(true)} 
            className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:text-emerald-500 transition-colors"
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
              Klik op Settings om in te loggen met je Spotify account via Node-RED.
            </p>
          </div>
          <button 
            onClick={() => setShowSettings(true)} 
            className="px-8 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 active:scale-95 transition-all"
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
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-[1.5rem] flex items-center justify-center">
                    <Music size={28} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 uppercase tracking-widest">
                    Spotify Authenticatie
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
                  Om Spotify te gebruiken moet je eerst authenticeren via Node-RED. 
                  Dit proces wordt maar één keer uitgevoerd en je tokens worden veilig opgeslagen.
                </p>

                <div className="w-full p-8 bg-emerald-50 rounded-[2rem] border border-emerald-100">
                  <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em] mb-4">
                    Wat gebeurt er?
                  </h4>
                  <ol className="space-y-3 text-[11px] text-emerald-600 font-medium leading-relaxed">
                    <li className="flex gap-3">
                      <span className="font-black">1.</span>
                      <span>Je wordt doorverwezen naar Spotify's login pagina</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-black">2.</span>
                      <span>Log in met je Spotify account</span>
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
                  className="w-full py-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black text-lg uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                  <Music size={20} /> Inloggen met Spotify
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
      <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1 flex flex-col transition-all hover:border-emerald-200">
        <div className="flex justify-between items-center mb-6">
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2">
            <Music size={10} className="text-emerald-500" /> Spotify
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                Verbonden
              </span>
            </div>
            <button 
              onClick={fetchNowPlaying}
              className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:text-emerald-500 transition-colors"
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
            Start een track op Spotify
          </p>
        </div>
      </div>
    );
  }

  // Active playback state
  const progressPercentage = (localProgress / playback.duration) * 100;

  return (
    <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1 flex flex-col transition-all hover:border-emerald-200 relative">
      <div className="flex justify-between items-center mb-6">
        <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] flex items-center gap-2">
          <Music size={10} className="text-emerald-500" /> Spotify
        </span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${playback.isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              {playback.device || 'Spotify'}
            </span>
          </div>
          <button 
            onClick={fetchNowPlaying}
            className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:text-emerald-500 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

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
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600">
                <Music size={48} className="text-white/50" />
              </div>
            )}
          </div>
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg">
            <Volume2 size={16} />
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
              className="h-full bg-emerald-400 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-black text-gray-300 tabular-nums">
            <span>{formatTime(localProgress)}</span>
            <span>{formatTime(playback.duration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-10 text-gray-400">
          <button 
            onClick={skipPrevious}
            className="hover:text-emerald-500 transition-colors active:scale-90"
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
            className="hover:text-emerald-500 transition-colors active:scale-90"
          >
            <SkipForward size={24} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
};
