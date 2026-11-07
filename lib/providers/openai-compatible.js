// OpenAI 호환(chat/completions) 형식을 쓰는 서비스들: GitHub Models, Groq
import { fetchWithTimeout } from '../fetch-timeout.js';

const TIMEOUT_MS = 20000;

function openAICompatible({ id, label, envKey, url, modelEnv, defaultModel, extraHeaders = {} }) {
  return {
    id,
    label,
    envKey,
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
  extraHeaders: { 'X-GitHub-Api-Version': '2022-11-28' },
});

export const groq = openAICompatible({
  id: 'groq',
  label: 'Groq',
  envKey: 'GROQ_API_KEY',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  modelEnv: 'GROQ_MODEL',
  defaultModel: 'llama-3.3-70b-versatile',
});
