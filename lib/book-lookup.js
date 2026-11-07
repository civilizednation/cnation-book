// 책 제목/저자를 받아 웹 검색 근거로 구조화된 JSON 정보를 만듭니다.
// 여러 AI를 순서대로 시도하며(기본: gemini,github,groq), JSON 파싱까지 실패하면
// 다음 AI로 넘어갑니다 — 한 AI가 응답은 했지만 쓸모없으면 그 자리에서 끝내지 않습니다.
import { gemini } from './providers/gemini.js';
import { github, groq } from './providers/openai-compatible.js';
import { hasWebSearch, bookSearch, searchResultsText } from './search.js';
import { systemPrompt, userPrompt } from './prompt.js';
import { extractJson } from './json-extract.js';

const MAX_TITLE_LENGTH = 200;
const MAX_AUTHOR_LENGTH = 100;
const PROVIDERS = { gemini, github, groq };
const DEFAULT_ORDER = 'gemini,github,groq';

export function availableProviders() {
  return (process.env.AI_ORDER || DEFAULT_ORDER)
    .split(',')
    .map((id) => PROVIDERS[id.trim()])
    .filter((provider) => provider && process.env[provider.envKey]?.trim());
}

export function validateRequest({ title, author } = {}) {
  const t = typeof title === 'string' ? title.trim() : '';
  const a = typeof author === 'string' ? author.trim() : '';
  if (!t) return '책 제목을 입력해주세요.';
  if (!a) return '저자를 입력해주세요.';
  if (t.length > MAX_TITLE_LENGTH) return `책 제목은 ${MAX_TITLE_LENGTH}자 이내로 입력해주세요.`;
  if (a.length > MAX_AUTHOR_LENGTH) return `저자는 ${MAX_AUTHOR_LENGTH}자 이내로 입력해주세요.`;
  if (!hasWebSearch()) return '웹 검색 키가 등록되어 있지 않습니다. TAVILY_API_KEY를 확인하세요.';
  if (!availableProviders().length) return '등록된 AI 키가 없습니다. GEMINI_API_KEY 등 환경변수를 확인하세요.';
  return null;
}

// 성공하면 { ok: true, data, provider, model, sources }, 실패하면 { ok: false, error }
export async function lookupBook({ title, author }) {
  let found;
  try {
    found = await bookSearch({ title, author });
  } catch (error) {
    return { ok: false, error: `웹 검색 중 오류가 발생했습니다: ${error.message}` };
  }
  if (!found.ok || !found.results.length) {
    return { ok: false, error: `이 책 정보를 웹에서 찾지 못했습니다. (${found.error || '검색 결과 없음'}) 제목과 저자를 다시 확인해주세요.` };
  }

  const system = systemPrompt();
  const user = userPrompt({ title, author, searchResultsText: searchResultsText(found.results) });
  const failures = [];

  for (const provider of availableProviders()) {
    let started;
    try {
      started = await provider.start({ apiKey: process.env[provider.envKey].trim(), system, user });
    } catch (error) {
      started = { ok: false, error: error.message };
    }
    if (!started.ok) {
      failures.push(`${provider.label}: ${started.error}`);
      continue;
    }
    let data;
    try {
      data = extractJson(started.text);
    } catch (error) {
      failures.push(`${provider.label}: JSON 파싱 실패 (${error.message})`);
      continue;
    }
    if (!data.title || !Array.isArray(data.parts) || !data.parts.length) {
      failures.push(`${provider.label}: 응답 형식이 올바르지 않습니다.`);
      continue;
    }
    if (!Array.isArray(data.sources) || !data.sources.length) {
      data.sources = found.results.slice(0, 6).map(({ title: t, url }) => ({ title: t, url, note: '' }));
    }
    return { ok: true, data, provider: provider.label, model: started.model };
  }

  return { ok: false, error: `모든 AI 호출에 실패했습니다. 잠시 후 다시 시도해주세요.\n${failures.join('\n')}` };
}
