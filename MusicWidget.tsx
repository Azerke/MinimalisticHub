import React, { useState, useEffect } from 'react';
import { SpotifyWidget } from './SpotifyWidget';
import { SonosWidget } from './SonosWidget';

interface MusicWidgetProps {
  nodeRedBaseUrl: string;
}

export const MusicWidget: React.FC<MusicWidgetProps> = ({ nodeRedBaseUrl }) => {
  const [activeSource, setActiveSource] = useState<'spotify' | 'sonos' | 'loading'>('loading');

  useEffect(() => {
    const checkActiveSources = async () => {
      try {
        // Check both sources simultaneously
        const [spotifyResponse, sonosResponse] = await Promise.all([
          fetch(`${nodeRedBaseUrl}/spotifynowplaying`).then(r => r.json()).catch(() => null),
          fetch(`${nodeRedBaseUrl}/sonosnowplaying`).then(r => r.json()).catch(() => null)
        ]);

        // Priority: Sonos playing > Spotify playing > Sonos authenticated > Spotify authenticated
        
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

        // If neither has data, prefer Sonos if authenticated, otherwise Spotify
        if (sonosResponse && !sonosResponse.error) {
          setActiveSource('sonos');
        } else {
          setActiveSource('spotify');
        }
      } catch (error) {
        // Default to Spotify on error
        setActiveSource('spotify');
      }
    };

    // Check immediately
    checkActiveSources();

    // Check every 10 seconds to switch if needed
    const interval = setInterval(checkActiveSources, 10000);

    return () => clearInterval(interval);
  }, [nodeRedBaseUrl]);

  if (activeSource === 'loading') {
    return <SpotifyWidget nodeRedBaseUrl={nodeRedBaseUrl} />;
  }

  if (activeSource === 'sonos') {
    return <SonosWidget nodeRedBaseUrl={nodeRedBaseUrl} />;
  }

  return <SpotifyWidget nodeRedBaseUrl={nodeRedBaseUrl} />;
};
