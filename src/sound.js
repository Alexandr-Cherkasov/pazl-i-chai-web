const preference = 'pazl-i-chai-snap-sound';

export function createSnapSound() {
  let enabled = true;
  let context;
  let buffer;
  try {
    enabled = localStorage.getItem(preference) !== 'off';
  } catch {
    // Sound remains available for this session when storage is unavailable.
  }

  function prepare() {
    const length = Math.round(context.sampleRate * .09);
    const sound = context.createBuffer(1, length, context.sampleRate);
    const samples = sound.getChannelData(0);
    let smoothed = 0;
    for (let i = 0; i < length; i += 1) {
      const time = i / context.sampleRate;
      const noise = Math.random() * 2 - 1;
      smoothed += .13 * (noise - smoothed);
      const attack = Math.min(time / .0015, 1);
      const rustle = smoothed * .43 * Math.exp(-time * 49);
      const snap = (noise - smoothed) * .17 * Math.exp(-time * 180);
      const body = Math.sin(2 * Math.PI * (240 * time - 600 * time * time)) * .21 * Math.exp(-time * 96);
      samples[i] = (rustle + snap + body) * attack * (1 - time / .09);
    }
    return sound;
  }

  return {
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      try {
        localStorage.setItem(preference, enabled ? 'on' : 'off');
      } catch {
        // The button still toggles sound for the current session.
      }
    },
    async play() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!enabled || !Audio) return;
      try {
        context ??= new Audio();
        if (context.state !== 'running') await context.resume();
        if (!enabled || context.state !== 'running') return;
        buffer ??= prepare();
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start();
      } catch {
        // Placement stays responsive even when playback is unavailable.
      }
    },
  };
}
