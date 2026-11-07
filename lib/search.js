// Tavily 웹 검색 (무료 키). "한 번의 검색에 의존하지 않는다"는 원칙에 따라
// 서점(예스24·교보문고·알라딘)·위키백과·일반 웹을 각각 따로 검색하고,
// 요약 조각이 아니라 페이지 본문(raw content)까지 받아서 AI에게 근거로 넘깁니다.
// https://docs.tavily.com
import { fetchWithTimeout } from './fetch-timeout.js';

const TAVILY_URL = 'https://api.tavily.com/search';
const TIMEOUT_MS = 15000;
// 페이지 하나에서 가져올 본문 길이. 서점 상세 페이지는 책 소개·목차·미리보기·독자 인물 목록이
// 길게 이어지므로 넉넉히 받고, 그 외 페이지는 조금 짧게 받습니다.
const PAGE_CHARS = { bookstore: 9000, wiki: 7000, web: 4000, part: 4000 };

export const BOOKSTORE_DOMAINS = ['yes24.com', 'kyobobook.co.kr', 'aladin.co.kr'];
const WIKI_DOMAINS = ['ko.wikipedia.org', 'ja.wikipedia.org', 'namu.wiki'];

export const hasWebSearch = () => Boolean(process.env.TAVILY_API_KEY?.trim());

async function callTavily(body) {
  const response = await fetchWithTimeout(TAVILY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TAVILY_API_KEY.trim()}`,
    },
    body: JSON.stringify(body),
  }, TIMEOUT_MS);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

// 성공하면 { ok: true, results: [{ title, url, content, kind }] }, 실패하면 { ok: false, error }
// kind: 'bookstore' | 'wiki' | 'web' | 'part' — 출처 종류 (교차 확인할 때 근거의 성격을 알려주기 위함)
export async function webSearch(query, { kind = 'web', domains, depth = 'advanced', maxResults = 5 } = {}) {
  const base = { query, max_results: maxResults, search_depth: depth };
  const extended = { ...base, include_raw_content: true, ...(domains ? { include_domains: domains } : {}) };
  let { response, data } = await callTavily(extended);
  // 확장 옵션(본문 포함·도메인 제한)이 거부되면 기본 검색으로 한 번 더 시도합니다.
  if (response.status === 400 || response.status === 422) {
    console.warn(`[tavily] 확장 옵션 거부 (HTTP ${response.status}) — 기본 검색으로 재시도`);
    ({ response, data } = await callTavily(domains ? { ...base, query: `${query} ${domains.map((d) => `site:${d}`).join(' OR ')}` } : base));
  }
  if (!response.ok) {
    const error = data.detail?.error || data.error || data.message || `HTTP ${response.status}`;
    console.warn(`[tavily] HTTP ${response.status}: ${error}`);
    return { ok: false, error: String(error) };
  }
  const limit = PAGE_CHARS[kind] || PAGE_CHARS.web;
  const results = (data.results || [])
    .filter((r) => r.url)
    .map((r) => {
      const raw = typeof r.raw_content === 'string' ? r.raw_content : '';
      // 본문이 요약보다 충분히 길 때만 본문을 쓰고, 아니면 요약을 씁니다.
      const body = raw.length > (r.content || '').length ? raw : (r.content || '');
      return { title: r.title || r.url, url: r.url, content: cleanText(body).slice(0, limit), kind: kindOf(r.url, kind) };
    })
    .filter((r) => r.content.length > 40);
  return { ok: true, results };
}

function kindOf(url, fallback) {
  if (BOOKSTORE_DOMAINS.some((d) => url.includes(d))) return 'bookstore';
  if (WIKI_DOMAINS.some((d) => url.includes(d))) return 'wiki';
  return fallback;
}

// 페이지 본문의 메뉴·공백 반복 등을 줄여 AI가 읽을 분량을 아낍니다.
function cleanText(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // 마크다운 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')    // 마크다운 링크 → 글자만
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const KIND_LABEL = { bookstore: '서점 상세 페이지', wiki: '위키 백과', web: '일반 웹', part: '편별 검색' };

// 검색 결과를 "번호 / 출처 종류 / 제목 / URL / 본문" 블록으로 묶은 근거 자료 텍스트를 만듭니다.
// maxChars를 넘으면 뒤쪽 자료부터 잘라냅니다 (무료 모델마다 받을 수 있는 입력 크기가 달라서).
export function searchResultsText(results, maxChars = Infinity) {
  let out = '';
  for (const [i, r] of results.entries()) {
    const block = `[${i + 1}] (${KIND_LABEL[r.kind] || '웹'}) ${r.title}\n${r.url}\n${r.content}\n\n`;
    if (out.length + block.length > maxChars) {
      const room = maxChars - out.length;
      if (room > 500) out += block.slice(0, room) + '…\n\n';
      break;
    }
    out += block;
  }
  return out.trim();
}

function mergeInto(merged, seen, results) {
  for (const r of results) {
    const key = r.url.replace(/[#?].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }
}

// 여러 갈래로 동시에 검색한 뒤 URL 기준으로 합칩니다.
// 서점 상세 페이지 → 위키 → 일반 웹 순으로 앞에 두어, 입력 한도가 작은 모델도 핵심 자료부터 읽게 합니다.
export async function bookSearch({ title, author }) {
  const plans = [
    { query: `${title} ${author}`, kind: 'bookstore', domains: BOOKSTORE_DOMAINS, maxResults: 6 },
    { query: `${title} ${author} 등장인물`, kind: 'web', maxResults: 6 },
    { query: `${title} ${author} 책 소개 줄거리 출판사`, kind: 'web', maxResults: 5 },
    { query: `${title} ${author} 소설`, kind: 'wiki', domains: WIKI_DOMAINS, maxResults: 3 },
  ];
  const settled = await Promise.allSettled(plans.map(({ query, ...opts }) => webSearch(query, opts)));
  const errors = [];
  const buckets = { bookstore: [], wiki: [], web: [] };
  for (const outcome of settled) {
    if (outcome.status === 'rejected') { errors.push(outcome.reason?.message || String(outcome.reason)); continue; }
    if (!outcome.value.ok) { errors.push(outcome.value.error); continue; }
    for (const r of outcome.value.results) (buckets[r.kind] || buckets.web).push(r);
  }
  const merged = [];
  const seen = new Set();
  mergeInto(merged, seen, buckets.bookstore);
  mergeInto(merged, seen, buckets.wiki);
  mergeInto(merged, seen, buckets.web);
  if (!merged.length) return { ok: false, error: errors.join('; ') || '검색 결과 없음' };
  return { ok: true, results: merged, seen };
}

// 단편집처럼 여러 편으로 나뉜 책은 편마다 따로 검색해, 인물이 다른 편과 섞이지 않게 근거를 보강합니다.
export async function partSearch({ title, author, partTitles, seen = new Set() }) {
  const targets = partTitles.filter(Boolean).slice(0, 8);
  const settled = await Promise.allSettled(targets.map((part) =>
    webSearch(`${title} ${author} "${part}" 등장인물 줄거리`, { kind: 'part', depth: 'basic', maxResults: 3 })));
  const merged = [];
  settled.forEach((outcome) => {
    if (outcome.status === 'fulfilled' && outcome.value.ok) mergeInto(merged, seen, outcome.value.results);
  });
  return merged;
}
