/** короткий сигнал нового заказа без внешних файлов */
export function play_new_order_chime() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    function tone(freq: number, start: number, dur: number, gain = 0.08) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    }

    tone(880, now, 0.12);
    tone(1174, now + 0.12, 0.16);
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    /* autoplay / unsupported */
  }
}
