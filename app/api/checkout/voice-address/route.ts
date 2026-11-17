import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------
// POST /api/checkout/voice-address
// Customer speaks their whole delivery address. We:
//   1. transcribe the audio with Groq Whisper (understands Hindi/Hinglish)
//   2. let a Groq LLM split it into street / apartment / landmark / pincode,
//      always written in English letters so the courier can read it.
// Uses the SAME GROQ_API_KEY already set for the AI chat widget.
// ---------------------------------------------------------------------
export const runtime = 'nodejs';
export const maxDuration = 30;

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
const LLM_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const MAX_AUDIO_BYTES = 3 * 1024 * 1024; // ~3 MB (~30s of voice)

// Tiny in-memory rate limit (per server instance) to stop abuse.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= 12) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

function withTimeout(ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

const SYSTEM_PROMPT = `You fill an Indian online-shop delivery address form from a spoken sentence.
The text may be Hindi, Hinglish, Bengali or English, and may have speech-recognition mistakes.
Return ONLY a JSON object with these string keys:
  "line1": house/flat number + street/road/gali/society name (the main street address),
  "line2": area / locality / colony / apartment / floor details (can be empty),
  "landmark": a landmark such as "near City Hospital" (can be empty),
  "pincode": exactly 6 digits if the customer said it (spoken digits like "ek teen paanch" or "one three five" must become numerals), else "".
Rules:
- Write everything in English letters (transliterate Hindi/Bengali words, e.g. "गांधी नगर" -> "Gandhi Nagar").
- Do NOT include city, state or pincode inside line1/line2/landmark (they have their own fields).
- Never invent anything the customer did not say. Leave a key as "" if not mentioned.
- Keep the customer's wording; just fix obvious recognition mistakes and spelling.`;

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'Voice typing is not configured (missing GROQ_API_KEY).' },
      { status: 503 }
    );
  }

  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'Too many tries. Please type your address.' }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }
  const audio = form.get('audio');
  const lang = String(form.get('language') || 'auto');
  if (!(audio instanceof Blob) || audio.size < 1000) {
    return NextResponse.json({ ok: false, error: 'No audio received. Please try again.' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, error: 'Recording too long. Keep it under 30 seconds.' }, { status: 413 });
  }

  // 1) Speech -> text (Whisper)
  let transcript = '';
  {
    const ext = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm';
    const fd = new FormData();
    fd.append('file', audio, `address.${ext}`);
    fd.append('model', WHISPER_MODEL);
    fd.append('response_format', 'json');
    fd.append('temperature', '0');
    if (['hi', 'en', 'bn'].includes(lang)) fd.append('language', lang);
    fd.append('prompt', 'Indian delivery address: house number, gali, road, nagar, colony, near landmark, pincode six digits.');
    const t = withTimeout(9000);
    try {
      const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
        signal: t.signal,
      });
      if (!res.ok) {
        console.error('[voice-address] whisper failed', res.status, await res.text().catch(() => ''));
        return NextResponse.json({ ok: false, error: 'Could not understand the audio. Please try again.' }, { status: 502 });
      }
      const data = (await res.json()) as { text?: string };
      transcript = (data.text || '').trim();
    } catch (err) {
      console.error('[voice-address] whisper error', err);
      return NextResponse.json({ ok: false, error: 'Voice service is slow. Please try again.' }, { status: 504 });
    } finally {
      t.done();
    }
  }
  if (!transcript) {
    return NextResponse.json({ ok: false, error: 'Did not hear anything. Please speak clearly and try again.' }, { status: 422 });
  }

  // 2) Text -> address fields (LLM). If it fails we still return the transcript.
  let parsed: { line1?: string; line2?: string; landmark?: string; pincode?: string } | null = null;
  for (const model of LLM_MODELS) {
    const t = withTimeout(6000);
    try {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 300,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: transcript },
          ],
        }),
        signal: t.signal,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        parsed = JSON.parse(content);
        break;
      }
    } catch (err) {
      console.error('[voice-address] llm error', model, err);
    } finally {
      t.done();
    }
  }

  const clean = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const pin = clean(parsed?.pincode, 12).replace(/\D/g, '');
  return NextResponse.json({
    ok: true,
    transcript,
    line1: clean(parsed?.line1) || (parsed ? '' : clean(transcript, 200)),
    line2: clean(parsed?.line2),
    landmark: clean(parsed?.landmark),
    pincode: pin.length === 6 ? pin : '',
  });
}
