/**
 * Synthesizes a clean, non-intrusive double-beep notification using Web Audio API.
 * Does not interrupt background music playback (Spotify / Apple Music) on mobile devices.
 */
export function playRestFinishedAlert(soundEnabled = true): void {
  if (typeof window === 'undefined') return;

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([180, 90, 220]);
    } catch {
      // Ignore vibration errors on unsupported browsers
    }
  }

  if (!soundEnabled) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };

    playTone(880, 0, 0.16);
    playTone(1174.66, 0.2, 0.24);

    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 650);
  } catch {
    // Ignore audio context autoplay restrictions if not yet interacted
  }
}
