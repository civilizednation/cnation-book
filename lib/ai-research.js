// "AI 검색" 근거: Gemini(무료 키)에게 Google 검색 연동(grounding)을 켜고 책을 조사하게 해서,
// Tavily와는 다른 검색 엔진·다른 AI의 시각으로 한 갈래 더 자료를 모읍니다.
// 이 결과는 어디까지나 "보조 자료"이며, 최종 정리 단계에서 서점·위키 등 원문 근거와 교차 확인됩니다.
// 실패해도 전체 조회를 막지 않습니다 (선택 단계).
import { fetchWithTimeout } from './fetch-timeout.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
const TIMEOUT_MS = 40000;

function researchPrompt({ title, author }) {
  return (
    `책 「${title}」(${author})에 대해 Google 검색으로 확인한 사실만 한국어로 정리해주세요.\n` +
    '- 한국어판 출판사, 출간 연도, 원제, 장르, 책의 구성(단편집이면 수록작 제목과 원제를 순서대로 모두)\n' +
    '- 각 편(또는 장편 전체)마다: 사건의 전제, 주요 등장인물의 이름·직업·가족관계·사건에서의 역할\n' +
    '- 평점이 공개된 서점·사이트가 있으면 점수와 사이트명\n' +
    '확인되지 않은 것은 "확인 안 됨"이라고 쓰고 절대 추측하지 마세요. 인물이 어느 편 소속인지 헷갈리면 적지 마세요. ' +
    '범인·결말·결정적 반전은 쓰지 마세요.'
  );
}

// 성공하면 { ok: true, text, sources: [{ title, url }], model }, 실패하면 { ok: false, error }
export async function geminiSearchResearch({ title, author }) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'GEMINI_API_KEY 없음' };
  let last = 'Gemini 검색 실패';
  for (const model of MODELS) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: researchPrompt({ title, author }) }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      }, TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        last = data.error?.message || `HTTP ${res.status}`;
        console.warn(`[gemini-search] ${model} -> HTTP ${res.status}: ${last}`);
        continue;
      }
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (!text) { last = '응답이 비어 있습니다.'; continue; }
      const chunks = candidate?.groundingMetadata?.groundingChunks || [];
      const sources = chunks
        .map((c) => c.web)
        .filter((w) => w?.uri)
        .map((w) => ({ title: w.title || w.uri, url: w.uri }));
      return { ok: true, text, sources, model };
    } catch (error) {
      last = error.message;
    }
  }
  return { ok: false, error: last };
}
