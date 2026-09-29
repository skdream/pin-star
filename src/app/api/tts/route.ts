/**
 * GET /api/tts?text=ship&speed=normal|slow&accent=en-US|en-GB|zh-CN
 * 服务端语音合成（供前端"服务端AI发音"引擎使用；中文报读传 accent=zh-CN）
 *
 * 引擎策略：
 * 1. 配置了 AZURE_TTS_KEY/AZURE_TTS_REGION → Azure Neural TTS（zh-CN→Xiaoxiao / en-US→Jenny / en-GB→Sonia，慢速 -40%）
 * 2. 未配置或 Azure 失败 → 内置 z-ai-web-dev-sdk TTS（zh-CN→tongtong 温暖中文 / en-GB→jam 英音绅士 / en-US→kazi 清晰标准）
 * 3. 都失败 → 503，前端自动降级浏览器本地发音
 *
 * 内存缓存 300 条（text|speed|accent → wav Buffer），重复词秒回。
 */
import { NextRequest, NextResponse } from "next/server";

/* ============ 缓存 ============ */
const CACHE_MAX = 300;
const cache = new Map<string, Buffer>();

function cacheKey(text: string, speed: string, accent: string): string {
  return `${text}|${speed}|${accent}`;
}

function cacheGet(key: string): Buffer | null {
  const hit = cache.get(key);
  if (hit) {
    // LRU touch：删了再放，保持插入顺序
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit ?? null;
}

function cacheSet(key: string, buf: Buffer): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, buf);
}

/* ============ Azure Neural TTS ============ */
const AZURE_VOICES: Record<string, string> = {
  "zh-CN": "zh-CN-XiaoxiaoNeural",
  "en-US": "en-US-JennyNeural",
  "en-GB": "en-GB-SoniaNeural",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSsml(text: string, voice: string, slow: boolean): string {
  const rate = slow ? "-40%" : "0%";
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.slice(0, 5)}">` +
    `<voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`
  );
}

async function azureToken(region: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function azureTTS(text: string, accent: string, slow: boolean): Promise<Buffer | null> {
  const key = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  if (!key || !region) return null;
  try {
    const token = await azureToken(region, key);
    if (!token) return null;
    const voice = AZURE_VOICES[accent] ?? AZURE_VOICES["en-US"];
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "phonics-star",
      },
      body: buildSsml(text, voice, slow),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/* ============ 内置 z-ai TTS ============ */
const ZAI_VOICES: Record<string, string> = {
  "zh-CN": "tongtong", // 温暖亲切（中文报读）
  "en-GB": "jam", // 英音绅士
  "en-US": "kazi", // 清晰标准
};

async function zaiTTS(text: string, accent: string, slow: boolean): Promise<Buffer> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const response = await zai.audio.tts.create({
    input: text,
    voice: ZAI_VOICES[accent] ?? "kazi",
    speed: slow ? 0.6 : 1.0,
    response_format: "wav",
    stream: false,
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(new Uint8Array(arrayBuffer));
}

/* ============ 路由 ============ */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const text = (searchParams.get("text") ?? "").trim();
    const speed = searchParams.get("speed") === "slow" ? "slow" : "normal";
    const accentRaw = searchParams.get("accent") ?? "en-US";
    const accent = ["en-GB", "zh-CN"].includes(accentRaw) ? accentRaw : "en-US";

    if (!text) {
      return NextResponse.json({ error: "缺少 text 参数" }, { status: 400 });
    }
    if (text.length > 60) {
      return NextResponse.json({ error: "text 过长（限 60 字符）" }, { status: 400 });
    }

    const key = cacheKey(text, speed, accent);
    const cached = cacheGet(key);
    if (cached) {
      return new NextResponse(cached as unknown as BodyInit, {
        headers: { "Content-Type": "audio/wav", "Cache-Control": "no-cache" },
      });
    }

    const slow = speed === "slow";
    let buffer: Buffer | null = null;
    let engine = "zai";

    if (process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION) {
      buffer = await azureTTS(text, accent, slow);
      if (buffer) engine = "azure";
    }
    if (!buffer) {
      buffer = await zaiTTS(text, accent, slow);
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: "语音合成失败，前端将降级为浏览器发音" }, { status: 503 });
    }

    cacheSet(key, buffer);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
        "X-TTS-Engine": engine,
      },
    });
  } catch (e) {
    console.error("[GET /api/tts]", e);
    return NextResponse.json({ error: "语音合成异常" }, { status: 503 });
  }
}
