import { useCallback, useEffect, useRef } from "react";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";

// Looping "incoming call" ringtone. An alarm-style tone so the client notices
// they're being called even if the phone is on silent.
const RINGTONE = require("../../assets/sounds/lesiakower-maze-of-thoughts-alarm-clock-311402.mp3");

/**
 * Controls the incoming-call ringtone. Loads one looping player and exposes
 * play()/stop(). Configured to sound even when the phone's ringer is silenced.
 */
export function useRingtone() {
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    const player = createAudioPlayer(RINGTONE);
    player.loop = true;
    playerRef.current = player;

    // Ring even when the device is on silent (incoming-call behavior).
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

    return () => {
      try {
        player.remove();
      } catch {
        // ignore teardown errors
      }
      playerRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.seekTo(0);
      p.play();
    } catch {
      // ignore — player may not be ready yet
    }
  }, []);

  const stop = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.pause();
      p.seekTo(0);
    } catch {
      // ignore
    }
  }, []);

  return { play, stop };
}
