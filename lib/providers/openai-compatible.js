// OpenAI 호환(chat/completions) 형식을 쓰는 서비스들: GitHub Models, Groq
import { fetchWithTimeout } from '../fetch-timeout.js';

const TIMEOUT_MS = 60000;

function openAICompatible({ id, label, envKey, url, modelEnv, defaultModel, maxEvidenceChars, extraHeaders = {} }) {
  return {
    id,
    label,
    envKey,
    maxEvidenceChars,
    models: () => [process.env[modelEnv] || defaultModel],

    async start({ apiKey, system, user }) {
      const [model] = this.models();
      let res;
      try {
        res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...extraHeaders,
          },
          body: JSON.stringify({
            model,
            stream: false,
            // 구조화된 JSON 한 덩어리를 받아야 하므로 JSON 모드를 강제합니다.
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        }, TIMEOUT_MS);
      } catch (error) {
        return { ok: false, error: error.message };
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const error = data.error?.message || data.message || `HTTP ${res.status}`;
        console.warn(`[${id}] ${model} -> HTTP ${res.status}: ${error}`);
        return { ok: false, error };
      }

      const data = await res.json().catch(() => ({}));
      const text = data.choices?.[0]?.message?.content;
      if (!text) return { ok: false, error: '응답이 비어 있습니다.' };
      return { ok: true, model, text };
    },
  };
}

export const github = openAICompatible({
  id: 'github',
  label: 'GitHub Models',
  envKey: 'GITHUB_MODELS_TOKEN',
  url: 'https://models.github.ai/inference/chat/completions',
  modelEnv: 'GITHUB_MODEL',
  defaultModel: 'openai/gpt-4.1-mini',
  // GitHub Models 무료 등급은 요청당 입력이 약 8천 토큰으로 작아서, 근거 자료를 앞쪽(서점·위키)부터 이만큼만 넣습니다.
  maxEvidenceChars: 7000,
  extraHeaders: { 'X-GitHub-Api-Version': '2022-11-28' },
});

// Groq 기본 모델(llama-3.1-8b-instant)은 소형 모델이라 한국어 책 정보를 지어내는 경우가 많아
// 신뢰성 원칙상 조회 흐름에서는 쓰지 않습니다 (lib/book-lookup.js의 PROVIDERS에 없음).
export const groq = openAICompatible({
  id: 'groq',
  label: 'Groq',
  envKey: 'GROQ_API_KEY',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  modelEnv: 'GROQ_MODEL',
  defaultModel: 'llama-3.1-8b-instant',
  maxEvidenceChars: 6000,
});
