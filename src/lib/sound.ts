type SoundName =
  | 'click'
  | 'shuffle'
  | 'flip'
  | 'peek'
  | 'gavel'
  | 'cheer'
  | 'oops'
  | 'tick'
  | 'write'
  | 'join'
  | 'win'
  | 'sparkle'
  | 'coin'
  | 'whoosh'
  | 'dramatic'
  | 'success'
  | 'pop'
  | 'podium'
  | 'lock';

class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    try {
      if (!this.context) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.context = new Ctor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.85;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    } catch {
      return null;
    }
  }

  private output(): AudioNode | null {
    return this.master ?? this.context?.destination ?? null;
  }

  private tone(
    context: AudioContext,
    options: {
      frequency: number;
      duration: number;
      type?: OscillatorType;
      volume?: number;
      delay?: number;
      endFrequency?: number;
    },
  ): void {
    const { frequency, duration, type = 'sine', volume = 0.06, delay = 0, endFrequency } = options;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.output() ?? context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  /** Layered tone: fundamental + octave shimmer for a richer, premium voice. */
  private richTone(
    context: AudioContext,
    frequency: number,
    options: {
      duration: number;
      volume?: number;
      delay?: number;
      type?: OscillatorType;
      shimmer?: boolean;
    } = { duration: 0.2 },
  ): void {
    const { duration, volume = 0.05, delay = 0, type = 'triangle', shimmer = true } = options;
    this.tone(context, { frequency, duration, type, volume, delay });
    if (shimmer) {
      this.tone(context, {
        frequency: frequency * 2,
        duration: duration * 0.6,
        type: 'sine',
        volume: volume * 0.35,
        delay,
      });
    }
  }

  private noise(
    context: AudioContext,
    duration: number,
    volume: number,
    bandFrequency: number,
    delay = 0,
    sweepTo?: number,
  ): void {
    const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(bandFrequency, context.currentTime + delay);
    if (sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(sweepTo, context.currentTime + delay + duration);
    }
    filter.Q.value = 0.65;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.output() ?? context.destination);
    source.start(context.currentTime + delay);
  }

  private arpeggio(context: AudioContext, notes: number[], step: number, options: { duration?: number; volume?: number; type?: OscillatorType } = {}): void {
    const { duration = 0.22, volume = 0.045, type = 'triangle' } = options;
    notes.forEach((frequency, index) => {
      this.richTone(context, frequency, { duration, volume, delay: index * step, type });
    });
  }

  play(name: SoundName): void {
    const context = this.getContext();
    if (!context) return;
    try {
      switch (name) {
        case 'click':
          this.tone(context, { frequency: 520, endFrequency: 430, duration: 0.06, type: 'triangle', volume: 0.05 });
          this.tone(context, { frequency: 1040, duration: 0.04, type: 'sine', volume: 0.02 });
          break;
        case 'pop':
          this.tone(context, { frequency: 480, endFrequency: 120, duration: 0.1, type: 'sine', volume: 0.09 });
          break;
        case 'flip':
          this.noise(context, 0.08, 0.05, 2600);
          this.tone(context, { frequency: 540, endFrequency: 310, duration: 0.12, type: 'triangle', volume: 0.05 });
          this.tone(context, { frequency: 1080, endFrequency: 620, duration: 0.09, type: 'sine', volume: 0.018, delay: 0.02 });
          break;
        case 'peek':
          this.tone(context, { frequency: 620, endFrequency: 880, duration: 0.18, volume: 0.05 });
          this.tone(context, { frequency: 1240, duration: 0.1, volume: 0.02, delay: 0.03 });
          break;
        case 'shuffle':
          this.noise(context, 0.22, 0.06, 1800);
          this.noise(context, 0.18, 0.05, 2800, 0.18);
          this.noise(context, 0.13, 0.04, 1300, 0.32);
          this.arpeggio(context, [880, 1108.7], 0.08, { duration: 0.1, volume: 0.015 });
          break;
        case 'whoosh':
          this.noise(context, 0.32, 0.07, 500, 0, 2800);
          this.noise(context, 0.22, 0.04, 2800, 0.08, 600);
          break;
        case 'gavel':
          this.tone(context, { frequency: 120, endFrequency: 55, duration: 0.28, type: 'sine', volume: 0.13 });
          this.noise(context, 0.06, 0.055, 700);
          this.tone(context, { frequency: 180, duration: 0.12, type: 'triangle', volume: 0.05, delay: 0.02 });
          break;
        case 'cheer':
          this.arpeggio(context, [523.25, 659.25, 783.99, 1046.5], 0.1, { duration: 0.28, volume: 0.05 });
          this.noise(context, 0.3, 0.02, 4200, 0.05);
          break;
        case 'win':
          this.arpeggio(context, [392, 523.25, 659.25, 783.99, 1046.5, 1318.5], 0.12, {
            duration: 0.36,
            volume: 0.055,
          });
          this.richTone(context, 261.63, { duration: 0.7, volume: 0.03, delay: 0.1, type: 'sine', shimmer: true });
          break;
        case 'podium':
          // Fanfare sting: stacked brass-like hits.
          [261.63, 329.63, 392, 523.25].forEach((frequency) => {
            this.tone(context, { frequency, duration: 0.5, type: 'sawtooth', volume: 0.028 });
            this.richTone(context, frequency, { duration: 0.5, volume: 0.04, delay: 0.02 });
          });
          this.arpeggio(context, [659.25, 783.99, 1046.5], 0.12, { duration: 0.3, volume: 0.045 });
          this.noise(context, 0.35, 0.018, 5000, 0.05);
          break;
        case 'dramatic':
          this.tone(context, { frequency: 110, endFrequency: 55, duration: 0.65, type: 'sawtooth', volume: 0.06 });
          this.tone(context, { frequency: 165, endFrequency: 82, duration: 0.65, type: 'triangle', volume: 0.05 });
          this.noise(context, 0.5, 0.03, 220, 0, 90);
          this.tone(context, { frequency: 523.25, duration: 0.18, volume: 0.035, delay: 0.42 });
          break;
        case 'success':
          this.arpeggio(context, [523.25, 659.25, 783.99], 0.09, { duration: 0.22, volume: 0.05 });
          this.tone(context, { frequency: 1318.5, duration: 0.2, volume: 0.025, delay: 0.27 });
          break;
        case 'sparkle':
          this.arpeggio(context, [1318.5, 1568, 2093, 2637], 0.05, { duration: 0.18, volume: 0.035, type: 'sine' });
          this.noise(context, 0.25, 0.016, 6500, 0);
          break;
        case 'coin':
          this.tone(context, { frequency: 1318.5, duration: 0.12, type: 'square', volume: 0.028 });
          this.tone(context, { frequency: 1760, duration: 0.28, type: 'square', volume: 0.028, delay: 0.08 });
          this.tone(context, { frequency: 2637, duration: 0.3, type: 'sine', volume: 0.02, delay: 0.08 });
          break;
        case 'lock':
          this.tone(context, { frequency: 190, duration: 0.06, type: 'square', volume: 0.05 });
          this.tone(context, { frequency: 320, duration: 0.08, type: 'triangle', volume: 0.05, delay: 0.07 });
          this.tone(context, { frequency: 520, duration: 0.12, volume: 0.04, delay: 0.14 });
          break;
        case 'oops':
          this.tone(context, { frequency: 320, endFrequency: 220, duration: 0.2, type: 'sawtooth', volume: 0.035 });
          this.tone(context, {
            frequency: 250,
            endFrequency: 160,
            duration: 0.26,
            type: 'sawtooth',
            volume: 0.03,
            delay: 0.18,
          });
          break;
        case 'tick':
          this.tone(context, { frequency: 720, duration: 0.03, type: 'square', volume: 0.018 });
          break;
        case 'write':
          this.noise(context, 0.1, 0.022, 3200);
          this.tone(context, { frequency: 840, duration: 0.05, volume: 0.012, delay: 0.02 });
          break;
        case 'join':
          this.richTone(context, 523.25, { duration: 0.16, volume: 0.04 });
          this.richTone(context, 783.99, { duration: 0.2, volume: 0.04, delay: 0.09 });
          this.richTone(context, 1046.5, { duration: 0.22, volume: 0.03, delay: 0.17, shimmer: true });
          break;
      }
    } catch {
      // Audio is decorative; never break a turn because of it.
    }
  }
}

export const sound = new SoundEngine();
export type { SoundName };
