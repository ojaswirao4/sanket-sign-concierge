// Hindi captions. Meera's replies are written in English and translated on the fly:
// Claude on the server when an API key is set (best quality), otherwise the browser's own
// on-device translator (Chrome's Translator API; free, offline once its Hindi model is downloaded).
// If neither is available, toHindi() resolves to null and the caption stays in English.

const cache = new Map();
// The browser translator can hang (for example in some embedded browsers); never wait on it forever.
const within = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
let local = null; // Chrome Translator instance, once created
let localTried = false;

// What this browser can do: 'available', 'downloadable' (needs a one-time download), or 'unavailable'
export async function browserHindi() {
  try {
    if (!('Translator' in self)) return 'unavailable';
    return await within(self.Translator.availability({ sourceLanguage: 'en', targetLanguage: 'hi' }), 4000, 'unavailable');
  } catch {
    return 'unavailable';
  }
}

// Create the browser translator. The first time it may download the Hindi model, which the browser
// only allows right after a click, so call this from the Hindi button's click handler.
export async function prepareBrowserHindi(onProgress) {
  if (local || !('Translator' in self)) return !!local;
  try {
    // the one-time model download can take a while on a slow connection
    local = await within(
      self.Translator.create({
        sourceLanguage: 'en',
        targetLanguage: 'hi',
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded));
        },
      }),
      180000,
      null
    );
  } catch {
    local = null;
  }
  localTried = true;
  return !!local;
}

// Before translating: "hard of hearing" is otherwise rendered as "सुनने वाले" (hearing people), the opposite.
const prepare = (text) => text.replace(/\bhard[- ]of[- ]hearing\b/gi, 'partially deaf');

// After translating: fix wording the translator gets wrong for this app.
export function fixHindi(hi, speaker) {
  let out = hi
    .replace(/आंशिक रूप से (बधिर|बहरे)/g, 'कम सुनने वाले')
    .replace(/(बधिर|बहरे)(\s+(?:और|एवं|व)\s+)सुनने वा(ले|लों)/g, '$1$2कम सुनने वा$3');
  // Meera is a woman: translators default to the masculine first person (करता हूँ, सकता हूँ, करूँगा).
  // These endings are only ever first person singular, so changing them is safe. Not applied to a
  // guest's own words, whose gender we don't know.
  if (speaker === 'meera')
    out = out
      .replace(/(त|रह)ा(\s+)(हूँ|हूं)/g, '$1ी$2$3')
      .replace(/(ूँ|ूं|ऊँ|ऊं)गा/g, '$1गी');
  return out;
}

// English text -> Hindi text, or null when no translator is available.
// speaker: 'meera' (her own replies, feminine first person) or 'guest'.
export async function toHindi(text, { serverAI, speaker = 'meera' }) {
  text = String(text || '').trim();
  if (!text) return '';
  const key = speaker + '|' + text;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  if (serverAI) {
    try {
      const r = await fetch('/api/hindi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, speaker }) });
      if (r.ok) out = (await r.json()).text || null;
    } catch {}
  }
  if (!out) {
    if (!local && !localTried && (await browserHindi()) === 'available') await prepareBrowserHindi();
    if (local) {
      try {
        out = await within(local.translate(prepare(text)), 15000, null);
      } catch {}
    }
  }
  if (out) {
    out = fixHindi(out, speaker);
    cache.set(key, out);
  }
  return out;
}
