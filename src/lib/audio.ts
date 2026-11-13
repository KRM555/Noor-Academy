class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq: number, duration = 0.14, type: OscillatorType = 'sine', volume = 0.09) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  playSuccess() {
    this.playTone(523.25, 0.12, 'triangle', 0.08);
    setTimeout(() => this.playTone(659.25, 0.14, 'triangle', 0.08), 80);
    setTimeout(() => this.playTone(783.99, 0.2, 'triangle', 0.09), 160);
  }

  playError() {
    this.playTone(260, 0.16, 'sine', 0.07);
    setTimeout(() => this.playTone(210, 0.2, 'sine', 0.07), 90);
  }

  playClick() {
    this.playTone(440, 0.06, 'sine', 0.04);
  }
}

export const soundFX = new SoundEngine();
