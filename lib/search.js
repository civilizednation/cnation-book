// Tavily 웹 검색 (무료 키). 책 소개·평점·등장인물을 "공식적으로 알려진 정보"로만 채우기 위해
// 매 조회마다 먼저 검색부터 하고, 그 결과를 AI 프롬프트에 근거 자료로 붙입니다.
// https://docs.tavily.com
import { fetchWithTimeout } from './fetch-timeout.js';

const TAVILY_URL = 'https://api.tavily.com/search';
const MAX_RESULTS = 6;
const MAX_CONTENT_LENGTH = 1200;
const TIMEOUT_MS = 8000;

export const hasWebSearch = () => Boolean(process.env.TAVILY_API_KEY?.trim());

// 성공하면 { ok: true, results: [{ title, url, content }] }, 실패하면 { ok: false, error }
export async function webSearch(query) {
  const response = await fetchWithTimeout(TAVILY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TAVILY_API_KEY.trim()}`,
    },
    body: JSON.stringify({
      query,
      max_results: MAX_RESULTS,
      search_depth: 'advanced',
    }),
  }, TIMEOUT_MS);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data.detail?.error || data.error || data.message || `HTTP ${response.status}`;
    console.warn(`[tavily] HTTP ${response.status}: ${error}`);
    return { ok: false, error: String(error) };
  }
  const results = (data.results || [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title || r.url, url: r.url, content: (r.content || '').slice(0, MAX_CONTENT_LENGTH) }));
  return { ok: true, results };
}

// 검색 결과를 "제목 / URL / 내용" 블록으로 묶은 근거 자료 텍스트를 만듭니다.
export function searchResultsText(results) {
  return results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`).join('\n\n');
}

// 책 소개/평점용과 등장인물용으로 검색어를 나눠 병렬로 검색한 뒤 URL 기준으로 합칩니다.
// 등장인물이 많은 단편집·시리즈는 한 번의 검색만으로 다 확인되지 않는 경우가 많아서,
// 인물 목록을 따로 다루는 페이지(독자 작성 목록 등)도 함께 찾도록 질의를 나눕니다.
export async function bookSearch({ title, author }) {
  const queries = [
    `${title} ${author} 책 소개 줄거리 출판사 평점`,
    `${title} ${author} 등장인물`,
  ];
  const settled = await Promise.allSettled(queries.map((q) => webSearch(q)));
  const seen = new Set();
  const merged = [];
  const errors = [];
  for (const outcome of settled) {
    if (outcome.status === 'rejected') { errors.push(outcome.reason?.message || String(outcome.reason)); continue; }
    const found = outcome.value;
    if (!found.ok) { errors.push(found.error); continue; }
    for (const r of found.results) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      merged.push(r);
    }
  }
  if (!merged.length) return { ok: false, error: errors.join('; ') || '검색 결과 없음' };
  return { ok: true, results: merged };
}
