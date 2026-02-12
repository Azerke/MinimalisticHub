import React, { useState, useEffect } from 'react';
import { SpotifyWidget } from './SpotifyWidget';
import { SonosWidget } from './SonosWidget';
import { Music, Speaker } from 'lucide-react';

interface MusicWidgetProps {
  nodeRedBaseUrl: string;
}

export const MusicWidget: React.FC<MusicWidgetProps> = ({ nodeRedBaseUrl }) => {
  const [activeSource, setActiveSource] = useState<'spotify' | 'sonos' | 'idle' | 'loading'>('loading');

  useEffect(() => {
    const checkActiveSources = async () => {
      try {
        const [spotifyResponse, sonosResponse] = await Promise.all([
          fetch(`${nodeRedBaseUrl}/spotifynowplaying`).then(r => r.json()).catch(() => null),
          fetch(`${nodeRedBaseUrl}/sonosnowplaying`).then(r => r.json()).catch(() => null)
        ]);
        
        if (sonosResponse && !sonosResponse.error && sonosResponse.isPlaying && sonosResponse.track) {
          setActiveSource('sonos');
          return;
        }

        if (spotifyResponse && !spotifyResponse.error && spotifyResponse.isPlaying && spotifyResponse.track) {
          setActiveSource('spotify');
          return;
        }

        if (sonosResponse && !sonosResponse.error && sonosResponse.track) {
          setActiveSource('sonos');
          return;
        }

        if (spotifyResponse && !spotifyResponse.error && spotifyResponse.track) {
          setActiveSource('spotify');
          return;
        }

        if ((sonosResponse && !sonosResponse.error) || (spotifyResponse && !spotifyResponse.error)) {
          setActiveSource('idle');
          return;
        }

        setActiveSource('idle');
      } catch (error) {
        setActiveSource('idle');
      }
    };

    checkActiveSources();
    const interval = setInterval(checkActiveSources, 10000);

    return () => clearInterval(interval);
  }, [nodeRedBaseUrl]);

  // Idle state
  if (activeSource === 'idle' || activeSource === 'loading') {
    return (
      // CHANGE 1: Removed 'flex-1' and added 'w-full' so it only takes necessary height
      <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 w-full flex flex-col transition-all hover:border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">
            Muziek
          </span>
        </div>

        <div className="flex flex-col items-center justify-center text-center p-8 space-y-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center group hover:scale-110 transition-transform">
              <Music size={32} className="text-emerald-500" />
            </div>
            <div className="w-px h-16 bg-gray-200" />
            <div className="w-20 h-20 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group hover:scale-110 transition-transform">
              <Speaker size={32} className="text-blue-500" />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">
              Niets aan het afspelen
            </p>
            <p className="text-[10px] text-gray-300 leading-relaxed max-w-xs">
              Start muziek op Spotify of Sonos om de widget te zien
            </p>
          </div>

          <div className="flex items-center gap-8 mt-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-300" />
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
                Spotify
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-300" />
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
                Sonos
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CHANGE 2: Wrapped these in a div to ensure they don't stretch if the components themselves have flex-1
  if (activeSource === 'sonos') {
    return (
      <div className="w-full">
        <SonosWidget nodeRedBaseUrl={nodeRedBaseUrl} />
      </div>
    );
  }

  return (
    <div className="w-full">
      <SpotifyWidget nodeRedBaseUrl={nodeRedBaseUrl} />
    </div>
  );
};