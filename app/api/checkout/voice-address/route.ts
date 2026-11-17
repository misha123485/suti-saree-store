import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------
// POST /api/checkout/voice-address
// One short spoken answer per call. multipart fields:
//   audio    - the recording
//   field    - 'name' | 'phone' | 'email' | 'address'
//   language - hi | en | bn | ta | te | mr | gu | kn | ml | pa
// Steps: Groq Whisper (speech -> text, language told explicitly) then a
// Groq LLM that turns the text into clean English-letter form values.
// Uses the SAME GROQ_API_KEY already set for the AI chat widget.
// ---------------------------------------------------------------------
export const runtime = 'nodejs';
export const maxDuration = 30;

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
const LLM_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const LANGS = ['hi', 'en', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa'];

// Tiny in-memory rate limit (per server instance) to stop abuse.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= 30) {
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

const COMMON = `The text comes from speech recognition of an Indian customer (Hindi, Hinglish, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi or English) and may contain recognition mistakes. Write every value in English letters (transliterate native words, e.g. "गांधी नगर" -> "Gandhi Nagar"). Never invent anything the customer did not say; use "" for anything not said. Return ONLY a JSON object.`;

const PROMPTS: Record<string, string> = {
  name: `${COMMON}
Task: the customer said their full name.
Keys: "first_name", "last_name" (both Proper Case; last_name may be ""; if more than two words, the first word is first_name and the rest is last_name). Drop titles like Shri/Mr/Mrs/Smt.`,
  phone: `${COMMON}
Task: the customer said their mobile number.
Key: "phone" = exactly 10 digits, as numerals only. Spoken digits in any language ("nau aath saat...", "ek do teen") become numerals. Remove +91, 91 or a leading 0. If you cannot get exactly 10 digits return "".`,
  email: `${COMMON}
Task: the customer said their email address.
Key: "email" = lowercase email. Convert spoken words: "at the rate", "at", "एट द रेट", "ऐट" -> "@"; "dot", "डॉट", "point" -> "."; "underscore" -> "_"; "dash"/"hyphen" -> "-"; remove spaces. Common domains: gmail.com, yahoo.com, outlook.com, hotmail.com. If it is not a valid email return "".`,
  address: `${COMMON}
Task: the customer said their delivery address.
Keys: "line1" = house/flat number + street/road/gali/society name (main street address); "line2" = area / locality / colony / apartment / floor (may be ""); "landmark" = e.g. "Near City Hospital" (may be ""); "pincode" = exactly 6 digits if said (spoken digits become numerals) else "".
Do NOT put city, state or pincode inside line1/line2/landmark.`,
};

const WHISPER_HINT: Record<string, string> = {
  name: 'Indian person full name.',
  phone: 'Indian mobile number, ten digits.',
  email: 'Email address like name at gmail dot com.',
  address: 'Indian delivery address: house number, gali, road, nagar, colony, near landmark, pincode six digits.',
};

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
    return NextResponse.json({ ok: false, error: 'Too many tries. Please type your details.' }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }
  const audio = form.get('audio');
  const field = String(form.get('field') || 'address');
  const lang = String(form.get('language') || 'hi');
  if (!PROMPTS[field]) {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }
  if (!(audio instanceof Blob) || audio.size < 1000) {
    return NextResponse.json({ ok: false, error: 'Did not hear anything. Please try again.' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, error: 'Recording too long. Please try again.' }, { status: 413 });
  }

  // 1) Speech -> text (Whisper), language told explicitly
  let transcript = '';
  {
    const ext = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm';
    const fd = new FormData();
    fd.append('file', audio, `voice.${ext}`);
    fd.append('model', WHISPER_MODEL);
    fd.append('response_format', 'json');
    fd.append('temperature', '0');
    fd.append('language', LANGS.includes(lang) ? lang : 'hi');
    fd.append('prompt', WHISPER_HINT[field]);
    const t = withTimeout(9000);
    try {
      const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
        signal: t.signal,
      });
      if (!res.ok) {
        console.error('[voice] whisper failed', res.status, await res.text().catch(() => ''));
        return NextResponse.json({ ok: false, error: 'Could not understand the audio. Please try again.' }, { status: 502 });
      }
      const data = (await res.json()) as { text?: string };
      transcript = (data.text || '').trim();
    } catch (err) {
      console.error('[voice] whisper error', err);
      return NextResponse.json({ ok: false, error: 'Voice service is slow. Please try again.' }, { status: 504 });
    } finally {
      t.done();
    }
  }
  if (!transcript) {
    return NextResponse.json({ ok: false, error: 'Did not hear anything. Please speak clearly and try again.' }, { status: 422 });
  }

  // 2) Text -> clean English-letter values (LLM)
  let parsed: Record<string, unknown> | null = null;
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
            { role: 'system', content: PROMPTS[field] },
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
      console.error('[voice] llm error', model, err);
    } finally {
      t.done();
    }
  }

  const s = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const digits = (v: unknown) => s(v, 20).replace(/\D/g, '');

  if (field === 'name') {
    return NextResponse.json({
      ok: true,
      transcript,
      first_name: s(parsed?.first_name, 60),
      last_name: s(parsed?.last_name, 60),
    });
  }
  if (field === 'phone') {
    let p = digits(parsed?.phone);
    if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
    return NextResponse.json({ ok: true, transcript, phone: p.length === 10 ? p : '' });
  }
  if (field === 'email') {
    const e = s(parsed?.email, 120).toLowerCase().replace(/\s+/g, '');
    return NextResponse.json({
      ok: true,
      transcript,
      email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : '',
    });
  }
  const pin = digits(parsed?.pincode);
  return NextResponse.json({
    ok: true,
    transcript,
    line1: s(parsed?.line1) || (parsed ? '' : s(transcript, 200)),
    line2: s(parsed?.line2),
    landmark: s(parsed?.landmark),
    pincode: pin.length === 6 ? pin : '',
  });
}
