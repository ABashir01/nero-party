declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }

  namespace YT {
    interface Player {
      destroy(): void;
      getCurrentTime(): number;
      getDuration(): number;
      getPlayerState(): number;
      getVideoData(): { video_id: string };
      loadVideoById(options: { videoId: string; startSeconds?: number }): void;
      cueVideoById(options: { videoId: string; startSeconds?: number }): void;
      playVideo(): void;
      pauseVideo(): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      setVolume(volume: number): void;
    }

    interface PlayerEvent {
      target: Player;
      data: number;
    }

    interface PlayerOptions {
      height: string;
      width: string;
      videoId?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (event: PlayerEvent) => void;
        onStateChange?: (event: PlayerEvent) => void;
      };
    }

    const PlayerState: {
      UNSTARTED: -1;
      ENDED: 0;
      PLAYING: 1;
      PAUSED: 2;
      BUFFERING: 3;
      CUED: 5;
    };

    const Player: new (elementId: string, options: PlayerOptions) => Player;
  }
}

let loaderPromise: Promise<typeof window.YT> | null = null;

export function loadYouTubeIframeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (loaderPromise) {
    return loaderPromise;
  }

  loaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Failed to load YouTube IFrame API."));
      document.head.appendChild(script);
    }

    window.onYouTubeIframeAPIReady = () => {
      if (!window.YT) {
        reject(new Error("YouTube API did not initialize."));
        return;
      }

      resolve(window.YT);
    };
  });

  return loaderPromise;
}
