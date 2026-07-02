// Plays the psychic's "new reading request" alert by looping an audio file.
//
// Previously this was a synthesized Web Audio chime; it now plays
// public/sounds/request-alert.mp3 (a soft, on-brand tone) on a loop until the
// request is accepted/declined. The exported API is unchanged, so callers
// (Sidebar, PsychicSessionGlass) need no updates.

const SOUND_SRC = "/sounds/request-alert.mp3";

let audio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SOUND_SRC);
    audio.loop = true;
    audio.preload = "auto";
  }
  return audio;
}

// Unlock the <audio> element for later autoplay. Browsers block audio.play()
// unless it first happens inside a user gesture, so call this from a click (the
// "Enable sounds" toggle). Plays muted for an instant, then pauses/rewinds —
// after which start/stopNotificationSound() can play without a user gesture.
export function primeNotificationSound(): void {
  const el = getAudio();
  const prevVolume = el.volume;
  el.volume = 0;
  const restore = () => {
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      // ignore
    }
    el.volume = prevVolume;
  };
  el.play().then(restore).catch(restore);
}

// Start the looping request alert. Safe to call repeatedly — restarts from 0.
export function startNotificationSound(): void {
  const el = getAudio();
  try {
    el.currentTime = 0;
  } catch {
    // currentTime can throw before metadata loads — harmless, ignore.
  }
  // play() may reject under the browser autoplay policy until the user has
  // interacted with the page. Swallow that; the sound plays once allowed.
  void el.play().catch(() => {});
}

// Stop the looping request alert and rewind.
export function stopNotificationSound(): void {
  if (!audio) return;
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // ignore
  }
}
