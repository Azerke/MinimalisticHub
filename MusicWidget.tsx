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
        // Check both sources simultaneously
        const [spotifyResponse, sonosResponse] = await Promise.all([
          fetch(`${nodeRedBaseUrl}/spotifynowplaying`).then(r => r.json()).catch(() => null),
          fetch(`${nodeRedBaseUrl}/sonosnowplaying`).then(r => r.json()).catch(() => null)
        ]);

        // Priority: Sonos playing > Spotify playing > Sonos authenticated > Spotify authenticated > Idle
        
        // Check if Sonos is actively playing
        if (sonosResponse && !sonosResponse.error && sonosResponse.isPlaying && sonosResponse.track) {
          setActiveSource('sonos');
          return;
        }

        // Check if Spotify is actively playing
        if (spotifyResponse && !spotifyResponse.error && spotifyResponse.isPlaying && spotifyResponse.track) {
          setActiveSource('spotify');
          return;
        }

        // If neither is playing, check which has data (recently played)
        if (sonosResponse && !sonosResponse.error && sonosResponse.track) {
          setActiveSource('sonos');
          return;
        }

        if (spotifyResponse && !spotifyResponse.error && spotifyResponse.track) {
          setActiveSource('spotify');
          return;
        }

        // If both are authenticated but nothing playing, show idle state
        if ((sonosResponse && !sonosResponse.error) || (spotifyResponse && !spotifyResponse.error)) {
          setActiveSource('idle');
          return;
        }

        // Default to idle if nothing is working
        setActiveSource('idle');
      } catch (error) {
        setActiveSource('idle');
      }
    };

    // Check immediately
    checkActiveSources();

    // Check every 10 seconds to switch if needed
    const interval = setInterval(checkActiveSources, 10000);

    return () => clearInterval(interval);
  }, [nodeRedBaseUrl]);

  // Idle state - nothing playing
  if (activeSource === 'idle' || activeSource === 'loading') {
    return (
      <div className="p-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex-1 flex flex-col transition-all hover:border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">
            Muziek
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-8">
          {/* Logo's */}
          <div className="flex items-center gap-6">
            {/* Spotify Logo */}
            <div className="w-20 h-20 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center group hover:scale-110 transition-transform">
              <Music size={32} className="text-emerald-500" />
            </div>
            
            {/* Divider */}
            <div className="w-px h-16 bg-gray-200" />
            
            {/* Sonos Logo */}
            <div className="w-20 h-20 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group hover:scale-110 transition-transform">
              <Speaker size={32} className="text-blue-500" />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-3">
            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">
              Niets aan het afspelen
            </p>
            <p className="text-[10px] text-gray-300 leading-relaxed max-w-xs">
              Start muziek op Spotify of Sonos om de widget te zien
            </p>
          </div>

          {/* Brand Labels */}
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

  if (activeSource === 'sonos') {
    return <SonosWidget nodeRedBaseUrl={nodeRedBaseUrl} />;
  }

  return <SpotifyWidget nodeRedBaseUrl={nodeRedBaseUrl} />;
};
