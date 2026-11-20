/**
 * ABSU Connect — Web Audio API Call Synthesizer
 * Zero-asset audio tones for incoming ringtones, outgoing ringing, connected chimes,
 * and call end alerts. Works 100% offline and uses zero network bandwidth.
 */

class CallAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: any = null;
  private isRinging = false;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioContextClass();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Start ringing loop for incoming call
   */
  startIncomingRingtone(): void {
    if (this.isRinging) return;
    this.isRinging = true;

    const playHarmonicRing = () => {
      const ctx = this.getAudioContext();
      if (!ctx || !this.isRinging) return;

      const now = ctx.currentTime;

      // Note 1: E5 (659 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.52);

      // Note 2: G#5 (830 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(830.61, now + 0.12);
      gain2.gain.setValueAtTime(0, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.22, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.67);

      // Note 3: B5 (987 Hz)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(987.77, now + 0.25);
      gain3.gain.setValueAtTime(0, now + 0.25);
      gain3.gain.linearRampToValueAtTime(0.25, now + 0.3);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.25);
      osc3.stop(now + 0.87);
    };

    playHarmonicRing();
    this.ringInterval = setInterval(playHarmonicRing, 2200);

    // Trigger device vibration if available
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([300, 200, 300, 200, 400]);
      } catch {}
    }
  }

  /**
   * Start gentle dial-back ring for outgoing call
   */
  startOutgoingRinging(): void {
    if (this.isRinging) return;
    this.isRinging = true;

    const playDialTone = () => {
      const ctx = this.getAudioContext();
      if (!ctx || !this.isRinging) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now); // A4
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now); // Dual tone phone ring

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gain.gain.setValueAtTime(0.12, now + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.36);
      osc2.stop(now + 1.36);
    };

    playDialTone();
    this.ringInterval = setInterval(playDialTone, 3000);
  }

  /**
   * Stop any active ring/dial tones
   */
  stopRinging(): void {
    this.isRinging = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }

  /**
   * Play clean confirmation chime when call connects
   */
  playConnectedChime(): void {
    this.stopRinging();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.15); // C6

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  /**
   * Play soft two-tone chime when call ends or is declined
   */
  playEndChime(): void {
    this.stopRinging();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.19);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(330, now + 0.12);
    gain2.gain.setValueAtTime(0.12, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.36);
  }
}

export const callAudio = new CallAudioSynthesizer();
