/** Web Audio signals for barista station — no external files */

type audio_tone = {
  freq: number;
  start: number;
  dur: number;
  gain?: number;
  type?: OscillatorType;
};

function get_ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    return new Ctx();
  } catch {
    return null;
  }
}

function play_tones(tones: audio_tone[], close_after_ms = 800) {
  const ctx = get_ctx();
  if (!ctx) return;
  const now = ctx.currentTime;

  for (const t of tones) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = t.type || 'sine';
    osc.frequency.value = t.freq;
    const gain = t.gain ?? 0.08;
    const start = now + t.start;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, start + t.dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }

  window.setTimeout(() => void ctx.close(), close_after_ms);
}

/** новый заказ на доске */
export function play_new_order_chime() {
  play_tones([
    { freq: 880, start: 0, dur: 0.12 },
    { freq: 1174, start: 0.12, dur: 0.16 },
  ]);
}

/** старт приготовления */
export function play_start_chime() {
  play_tones([
    { freq: 523, start: 0, dur: 0.08, gain: 0.06 },
    { freq: 784, start: 0.09, dur: 0.12, gain: 0.07 },
  ]);
}

/** напиток отмечен готовым */
export function play_drink_ready_chime() {
  play_tones([
    { freq: 660, start: 0, dur: 0.1, gain: 0.07 },
    { freq: 880, start: 0.1, dur: 0.12, gain: 0.08 },
    { freq: 1320, start: 0.22, dur: 0.14, gain: 0.06 },
  ]);
}

/** писк в последние секунды таймера */
export function play_timer_tick() {
  play_tones([{ freq: 1400, start: 0, dur: 0.05, gain: 0.05, type: 'square' }], 200);
}

/** будильник — таймер истёк */
export function play_timer_alarm() {
  play_tones(
    [
      { freq: 880, start: 0, dur: 0.18, gain: 0.1 },
      { freq: 880, start: 0.22, dur: 0.18, gain: 0.1 },
      { freq: 880, start: 0.44, dur: 0.18, gain: 0.1 },
      { freq: 1174, start: 0.7, dur: 0.35, gain: 0.11 },
    ],
    1400
  );
}

/** звон монет при оплате */
export function play_payment_chime() {
  play_tones(
    [
      { freq: 1800, start: 0, dur: 0.06, gain: 0.05, type: 'triangle' },
      { freq: 2400, start: 0.05, dur: 0.07, gain: 0.06, type: 'triangle' },
      { freq: 1600, start: 0.11, dur: 0.05, gain: 0.045, type: 'triangle' },
      { freq: 2200, start: 0.16, dur: 0.08, gain: 0.055, type: 'triangle' },
      { freq: 2800, start: 0.22, dur: 0.1, gain: 0.04, type: 'sine' },
    ],
    500
  );
}

/** торжественная выдача заказа */
export function play_handout_chime() {
  play_tones(
    [
      { freq: 392, start: 0, dur: 0.18, gain: 0.07 },
      { freq: 523, start: 0.14, dur: 0.18, gain: 0.08 },
      { freq: 659, start: 0.28, dur: 0.2, gain: 0.09 },
      { freq: 784, start: 0.44, dur: 0.22, gain: 0.1 },
      { freq: 1046, start: 0.62, dur: 0.45, gain: 0.11 },
      { freq: 1318, start: 0.78, dur: 0.35, gain: 0.06 },
    ],
    1400
  );
}
