// Google Gemini (무료 키). 구조화된 JSON 한 덩어리를 받을 것이므로 스트리밍 없이 완결 응답만 받습니다.
import { fetchWithTimeout } from '../fetch-timeout.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const TIMEOUT_MS = 60000;

export const gemini = {
  id: 'gemini',
  label: 'Gemini',
  envKey: 'GEMINI_API_KEY',
  // 무료 키도 입력 한도가 매우 커서(100만 토큰급) 서점·위키 페이지 본문을 거의 다 넣을 수 있습니다.
  maxEvidenceChars: 150000,
  models: () => [...new Set([process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean))],

  // 성공하면 { ok: true, model, text } 를, 실패하면 { ok: false, error } 를 돌려줍니다.
  async start({ apiKey, system, user }) {
    let last = { error: '사용 가능한 Gemini 모델이 없습니다.' };
    for (const model of this.models()) {
      let res;
      try {
        res = await fetchWithTimeout(`${API_BASE}/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            // 구조화된 JSON 한 덩어리를 받아야 하므로 JSON 모드를 강제하고, 등장인물이 많은
            // 단편집도 중간에 잘리지 않도록 출력 토큰 한도를 넉넉히 줍니다.
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16384 },
          }),
        }, TIMEOUT_MS);
      } catch (error) {
        last = { error: error.message };
        continue;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        last = { error: data.error?.message || `HTTP ${res.status}` };
        console.warn(`[gemini] ${model} -> HTTP ${res.status}: ${last.error}`);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) {
        last = { error: '응답이 비어 있습니다.' };
        continue;
      }
      if (candidate?.finishReason === 'MAX_TOKENS') {
        last = { error: '응답이 출력 한도를 넘어 중간에 잘렸습니다.' };
        continue;
      }
      return { ok: true, model, text };
    }
    return { ok: false, ...last };
  },
};
