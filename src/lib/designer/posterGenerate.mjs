import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Modality } from '@google/genai';

const IMAGE_MODELS = [
  process.env.GEMINI_POSTER_MODEL,
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
].filter(Boolean);

const VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
const ENV_LOCAL = path.resolve(process.cwd(), '.env.local');

const SYSTEM = `Ты рисуешь печатный плакат A4 (портрет ~2:3) нейросетью для бренда bubble tea.

Жёсткие правила:
1) Текст задачи пользователя — главный. Если просят конкретный слоган/слова — они должны быть читаемо написаны на плакате ТОЧНО как указано (кириллица).
2) Если дан референс — сохрани объект/продукт/лицо/композицию с референса. Не подменяй другим случайным напитком.
3) Если дан текущий плакат и правка — меняй только запрошенное, остальное оставляй.
4) Цвета бренда: коралл #FF6B6B, перл-синий #0039A6, чернила #20181B, белый — если пользователь не просит иное.
5) Полный кадр, без UI-рамок, водяных знаков и мокапов телефонов.
6) Всегда верни готовое изображение.`;

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

function extractImageAndText(response) {
  let text = '';
  let image = null;
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.text) text += part.text;
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType || 'image/png';
      image = `data:${mime};base64,${part.inlineData.data}`;
    }
  }
  return { text: text.trim(), image };
}

function hasUsableGeminiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

function friendlyGeminiError(e) {
  const raw = e?.message || String(e);
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota')) {
    return 'Квота Gemini на генерацию картинок закончилась / равна 0 на free-tier. Попробуй другой Google-аккаунт+ключ, либо включи биллинг в AI Studio. Сейчас используем обход: vision→Flux.';
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) {
    return 'Ключ Gemini невалиден. Создай новый на https://aistudio.google.com/apikey';
  }
  // extract nested message if JSON blob
  try {
    const m = raw.match(/"message":"([^"]+)"/);
    if (m?.[1]) return m[1].replace(/\\n/g, ' ').slice(0, 280);
  } catch {
    /* ignore */
  }
  return raw.slice(0, 280);
}

/** Сохранить ключ из UI → process.env + .env.local */
export function setGeminiApiKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key || key.length < 20) {
    const err = new Error('Вставь нормальный ключ из Google AI Studio');
    err.status = 400;
    throw err;
  }

  process.env.GEMINI_API_KEY = key;

  let existing = '';
  try {
    if (fs.existsSync(ENV_LOCAL)) existing = fs.readFileSync(ENV_LOCAL, 'utf8');
  } catch {
    existing = '';
  }

  const line = `GEMINI_API_KEY="${key.replace(/"/g, '')}"`;
  if (/^GEMINI_API_KEY=.+$/m.test(existing)) {
    existing = existing.replace(/^GEMINI_API_KEY=.+$/m, line);
  } else {
    existing = `${existing.trim()}\n${line}\n`.trimStart();
  }
  try {
    fs.writeFileSync(ENV_LOCAL, existing.endsWith('\n') ? existing : `${existing}\n`);
  } catch {
    // на сервере файл может быть только для чтения — ключ уже в process.env
  }

  return getPosterStatus();
}

export function buildPosterImagePrompt({
  prompt,
  brandName = 'yomoyo',
  primaryColor = '#0039A6',
  secondaryColor = '#FF6B6B',
  referenceBrief = '',
}) {
  const brief = String(prompt || '').trim();
  const ref = String(referenceBrief || '').trim();
  return [
    `USER BRIEF (follow exactly, including any Russian slogan text verbatim on the poster): ${brief}`,
    ref
      ? `REFERENCE PHOTO DETAILS (match this product/scene closely): ${ref}`
      : '',
    `Brand logo wordmark: "${brandName}".`,
    `Palette unless brief overrides: coral ${secondaryColor}, pearl blue ${primaryColor}, ink #20181B, white.`,
    'Print-ready A4 portrait poster, aspect 2:3, full-bleed, no watermark, no device mockup, no UI chrome.',
    'Readable Cyrillic typography when the brief includes Russian words. One strong composition, premium street bubble-tea look.',
    'Do not invent a different slogan. Do not ignore the user brief.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPollinationsImageUrl(input) {
  const prompt = buildPosterImagePrompt(input);
  const qs = new URLSearchParams({
    width: '1024',
    height: '1536',
    model: 'flux',
    nologo: 'true',
    enhance: 'false',
    seed: String(Date.now() % 1_000_000_000),
  });
  return {
    primary: `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${qs}`,
    legacy: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${qs}`,
    prompt,
  };
}

async function fetchImageAsDataUrl(url) {
  const key = process.env.POLLINATIONS_API_KEY;
  const headers = { Accept: 'image/*' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1500) {
    const err = new Error('Пустой ответ генератора');
    err.status = 502;
    throw err;
  }
  const mime = res.headers.get('content-type')?.includes('png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function generateViaPollinations(input) {
  const { primary, legacy } = buildPollinationsImageUrl(input);
  try {
    const image = await fetchImageAsDataUrl(primary);
    return {
      image,
      text: input.referenceBrief
        ? 'Сгенерировано: Gemini посмотрел референс → Flux нарисовал плакат.'
        : 'Сгенерировано (Flux).',
      model: 'pollinations-flux',
    };
  } catch {
    const image = await fetchImageAsDataUrl(legacy);
    return {
      image,
      text: input.referenceBrief
        ? 'Сгенерировано: Gemini посмотрел референс → Flux нарисовал плакат.'
        : 'Сгенерировано (Flux).',
      model: 'pollinations-flux-legacy',
    };
  }
}

async function describeForPoster({
  apiKey,
  prompt,
  referenceImage,
  currentImage,
}) {
  const ai = new GoogleGenAI({ apiKey });
  const parts = [
    {
      text: [
        'Ты art-director. По картинкам ниже напиши на АНГЛИЙСКОМ детальный visual brief для генерации печатного плаката.',
        'Опиши продукт/объект/композицию/цвета/материал так, чтобы художник воссоздал узнаваемый кадр.',
        'Не добавляй новый слоган. Слоган пользователя передаётся отдельно.',
        `Задача пользователя: ${prompt.trim()}`,
        'Ответ: 120–220 слов, только описание, без markdown.',
      ].join('\n'),
    },
  ];

  const ref = parseDataUrl(referenceImage);
  if (ref) {
    parts.push({ text: 'Reference photo:' });
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }
  const cur = parseDataUrl(currentImage);
  if (cur) {
    parts.push({ text: 'Current poster to edit from:' });
    parts.push({ inlineData: { mimeType: cur.mimeType, data: cur.data } });
  }

  const response = await ai.models.generateContent({
    model: VISION_MODEL,
    contents: [{ role: 'user', parts }],
  });

  const text =
    response?.text ||
    extractImageAndText(response).text ||
    '';
  if (!text.trim()) {
    const err = new Error('Gemini vision не описал референс');
    err.status = 502;
    throw err;
  }
  return text.trim();
}

async function generateViaGeminiImage({
  prompt,
  referenceImage,
  currentImage,
  brandName = 'yomoyo',
  primaryColor = '#0039A6',
  secondaryColor = '#FF6B6B',
  apiKey,
}) {
  const ai = new GoogleGenAI({ apiKey });
  const parts = [];

  parts.push({
    text: [
      SYSTEM,
      '',
      `Бренд на плакате: ${brandName}.`,
      `Цвета по умолчанию: коралл ${secondaryColor}, перл-синий ${primaryColor}.`,
      '',
      '===== ЗАДАЧА ПОЛЬЗОВАТЕЛЯ (выполни буквально) =====',
      prompt.trim(),
      '===== КОНЕЦ ЗАДАЧИ =====',
    ].join('\n'),
  });

  const ref = parseDataUrl(referenceImage);
  if (ref) {
    parts.push({
      text: 'РЕФЕРЕНС ниже — используй этот объект/сцену как основу:',
    });
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }

  const cur = parseDataUrl(currentImage);
  if (cur) {
    parts.push({
      text: 'Текущий плакат — отредактируй по задаче выше:',
    });
    parts.push({ inlineData: { mimeType: cur.mimeType, data: cur.data } });
  }

  let lastErr;
  for (const model of IMAGE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
          imageConfig: {
            aspectRatio: '2:3',
            imageSize: '1K',
          },
        },
      });
      const { text, image } = extractImageAndText(response);
      if (image) {
        return {
          image,
          text: text || 'Готово (Gemini Image, с учётом текста и референса).',
          model,
        };
      }
      lastErr = new Error(text || 'Модель не вернула изображение');
    } catch (e) {
      lastErr = e;
      const msg = e?.message || '';
      // quota / not found → try next model
      if (msg.includes('429') || msg.includes('404') || msg.includes('RESOURCE_EXHAUSTED')) {
        continue;
      }
      throw e;
    }
  }
  const err = new Error(friendlyGeminiError(lastErr));
  err.status = 429;
  err.code = 'GEMINI_IMAGE_QUOTA';
  throw err;
}

/** Vision (смотрит фотку) + Flux (рисует) — обход нулевой квоты image-моделей */
async function generateViaVisionThenFlux(input) {
  const apiKey = process.env.GEMINI_API_KEY;
  const referenceBrief = await describeForPoster({
    apiKey,
    prompt: input.prompt,
    referenceImage: input.referenceImage,
    currentImage: input.currentImage,
  });

  return generateViaPollinations({
    ...input,
    referenceBrief,
  });
}

export function getPosterStatus() {
  return {
    gemini: hasUsableGeminiKey(),
    model: hasUsableGeminiKey() ? 'gemini-vision+flux' : 'flux',
    referenceSupported: hasUsableGeminiKey(),
  };
}

export async function generatePoster(input) {
  const prompt = input?.prompt;
  if (!prompt?.trim()) {
    const err = new Error('Нужен промпт');
    err.status = 400;
    throw err;
  }

  const wantsVision = Boolean(
    parseDataUrl(input?.referenceImage) || parseDataUrl(input?.currentImage)
  );
  const hasGemini = hasUsableGeminiKey();

  if (wantsVision && !hasGemini) {
    const err = new Error(
      'Референс: вставь Gemini-ключ в панели → https://aistudio.google.com/apikey'
    );
    err.status = 400;
    err.code = 'GEMINI_REQUIRED_FOR_REFERENCE';
    throw err;
  }

  if (hasGemini) {
    // 1) пробуем нативный Gemini Image
    try {
      return await generateViaGeminiImage({ ...input, apiKey: process.env.GEMINI_API_KEY });
    } catch (e) {
      console.warn('Gemini image failed:', friendlyGeminiError(e));
      // 2) если есть референс/текущий кадр — vision→Flux
      if (wantsVision) {
        try {
          const result = await generateViaVisionThenFlux(input);
          return {
            ...result,
            text:
              'Gemini Image недоступен (квота 0). Обошли: Gemini посмотрел референс → Flux нарисовал.',
          };
        } catch (e2) {
          const err = new Error(friendlyGeminiError(e2));
          err.status = e2.status || 502;
          throw err;
        }
      }
      // 3) без референса — просто Flux
      return generateViaPollinations(input);
    }
  }

  try {
    return await generateViaPollinations(input);
  } catch {
    const urls = buildPollinationsImageUrl(input);
    return {
      image: urls.primary,
      imageAlt: urls.legacy,
      text: 'Нейросеть рисует плакат (Flux). Подожди превью.',
      model: 'pollinations-flux-url',
      remoteUrl: true,
    };
  }
}

export function attachPosterApi(app) {
  app.get('/api/poster/status', (_req, res) => {
    res.json(getPosterStatus());
  });

  app.post('/api/poster/key', (req, res) => {
    try {
      const status = setGeminiApiKey(req.body?.apiKey);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  app.post('/api/poster/generate', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await generatePoster(body);
      res.json(result);
    } catch (e) {
      const status = e.status || 500;
      res.status(status).json({
        error: friendlyGeminiError(e),
        code: e.code || undefined,
        status: getPosterStatus(),
      });
    }
  });
}
