/**
 * Mitr Phol Fermentation Lab Tracker - Multimodal Feedback Engine
 * Uses Web Audio API for synthetic lab feedback (no external asset dependencies)
 * and Navigator Vibrate API for mobile haptic feedback.
 */

class MultimodalAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Sound Chime for successful save or completion (Two gentle harmonic frequencies: C5 -> E5)
   */
  playSuccess() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5

      osc2.frequency.setValueAtTime(1046.5, now); // C6 overtone
      osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.12);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);

      this.triggerHaptic([30, 40, 30]);
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  /**
   * Mechanical Click Sound for Microscope Tally Counter
   */
  playClick() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.03);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);

      this.triggerHaptic(20);
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  /**
   * Warning Tone for out-of-range values or invalid inputs (e.g. Dead > Total)
   */
  playWarning() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.setValueAtTime(293.66, now + 0.08); // D4

      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.24);

      this.triggerHaptic([60, 40, 60]);
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  /**
   * Trigger mobile haptic vibration if supported by device
   */
  triggerHaptic(pattern = 25) {
    if (window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(pattern);
      } catch (e) {
        // Ignore haptic error if blocked by browser policy
      }
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}

window.labAudio = new MultimodalAudio();
