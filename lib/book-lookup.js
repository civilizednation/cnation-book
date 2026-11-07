// 책 제목/저자를 받아, 여러 갈래의 근거를 종합하고 교차 확인한 구조화 JSON을 만듭니다.
//
// 흐름 (모두 무료 키 기반):
//  1. 근거 수집 (동시에): Tavily로 서점(예스24·교보·알라딘)·위키·일반 웹 페이지 본문 검색
//                         + Gemini의 Google 검색 연동으로 "AI 검색 요약"
//  2. 정리(draft): 모은 근거를 종합해 초안 JSON 작성
//  3. 편별 보강: 단편집이면 편마다 따로 검색해서 근거 추가
//  4. 교차 확인(verify): 초안을 근거와 하나씩 대조해 근거 없는 내용은 지우고 신뢰도 표시
//  5. 출처 번호를 실제 URL로 바꾸고, 어떤 AI가 정리·검증했는지 기록
//
// 성능이 약한 소형 모델은 쓰지 않습니다. 강한 모델이 모두 실패하면 부실한 결과 대신 "조회 실패"를 돌려줍니다.
import { gemini } from './providers/gemini.js';
import { github } from './providers/openai-compatible.js';
import { hasWebSearch, bookSearch, partSearch, searchResultsText } from './search.js';
import { geminiSearchResearch } from './ai-research.js';
import { draftSystemPrompt, draftUserPrompt, verifySystemPrompt, verifyUserPrompt } from './prompt.js';
import { extractJson } from './json-extract.js';

const MAX_TITLE_LENGTH = 200;
const MAX_AUTHOR_LENGTH = 100;
const PROVIDERS = { gemini, github };
const DEFAULT_ORDER = 'gemini,github';

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

function isValidShape(data) {
  return data && data.title && Array.isArray(data.parts) && data.parts.length > 0;
}

// 등록된 AI를 순서대로 시도해 JSON 응답을 받습니다. 성공하면 { ok, data, provider, model, trimmed }.
// requireFull: 근거 자료를 잘라야 하는 모델은 건너뜀 (일부만 보고 검증하면 맞는 내용까지 지울 수 있어서)
async function runStage({ providers, system, buildUser, evidence, label, requireFull = false }) {
  const failures = [];
  for (const provider of providers) {
    const evidenceText = searchResultsText(evidence, provider.maxEvidenceChars);
    const trimmed = evidenceText.length < searchResultsText(evidence).length;
    if (requireFull && trimmed) { failures.push(`${provider.label}: 입력 한도가 작아 교차 확인에서 제외`); continue; }
    let started;
    try {
      started = await provider.start({ apiKey: process.env[provider.envKey].trim(), system, user: buildUser(evidenceText) });
    } catch (error) {
      started = { ok: false, error: error.message };
    }
    if (!started.ok) { failures.push(`${provider.label}: ${started.error}`); continue; }
    let data;
    try {
      data = extractJson(started.text);
    } catch (error) {
      failures.push(`${provider.label}: JSON 파싱 실패 (${error.message})`);
      continue;
    }
    if (!isValidShape(data)) { failures.push(`${provider.label}: 응답 형식이 올바르지 않습니다.`); continue; }
    return { ok: true, data, provider: provider.label, model: started.model, trimmed };
  }
  console.warn(`[lookup] ${label} 단계 실패:\n${failures.join('\n')}`);
  return { ok: false, error: failures.join('\n') };
}

// AI가 고른 근거 번호(ref)를 실제 출처로 바꾸고, 내부용 필드(refs)를 정리합니다.
function finalize(data, { evidence, aiResearch, draftInfo, verifyInfo }) {
  const byRef = (ref) => evidence[Number(ref) - 1];
  const seen = new Set();
  const sources = [];
  for (const s of Array.isArray(data.sources) ? data.sources : []) {
    const e = byRef(s?.ref);
    if (!e || seen.has(e.url)) continue;
    seen.add(e.url);
    sources.push({ title: e.title, url: e.url, note: typeof s.note === 'string' ? s.note : '' });
  }
  // 인물 근거로 쓰였지만 sources에 빠진 번호도 출처 목록에 넣습니다.
  for (const part of data.parts) {
    for (const c of part.mainCharacters || []) {
      for (const ref of Array.isArray(c.refs) ? c.refs : []) {
        const e = byRef(ref);
        if (e && !seen.has(e.url)) { seen.add(e.url); sources.push({ title: e.title, url: e.url, note: '' }); }
      }
      delete c.refs;
      if (c.confidence !== 'multi' && c.confidence !== 'single') delete c.confidence;
    }
    for (const c of part.supportingCharacters || []) {
      if (c.confidence !== 'multi' && c.confidence !== 'single') delete c.confidence;
    }
  }
  if (!sources.length) {
    evidence.slice(0, 6).forEach((e) => { if (!seen.has(e.url)) { seen.add(e.url); sources.push({ title: e.title, url: e.url, note: '' }); } });
  }
  if (aiResearch?.ok) {
    aiResearch.sources.slice(0, 6).forEach((s) => {
      if (seen.has(s.url)) return;
      seen.add(s.url);
      sources.push({ title: s.title, url: s.url, note: 'AI 검색(Gemini + Google 검색)이 참고한 페이지' });
    });
  }
  data.sources = sources;

  const notices = [typeof data.notice === 'string' ? data.notice.trim() : ''];
  if (!verifyInfo) notices.push('교차 확인 단계를 마치지 못해, 이 내용은 1차 정리본입니다. 나중에 삭제 후 다시 조회해보세요.');
  if ((verifyInfo || draftInfo).trimmed) notices.push('정리에 쓴 AI의 입력 한도 때문에 근거 자료 일부만 반영됐습니다.');
  const charCount = data.parts.reduce((n, p) => n + (p.mainCharacters?.length || 0), 0);
  if (!charCount) notices.push('근거 자료에서 등장인물을 충분히 확인하지 못했습니다.');
  data.notice = notices.filter(Boolean).join(' ');

  data.generatedBy = {
    draft: `${draftInfo.provider} (${draftInfo.model})`,
    verify: verifyInfo ? `${verifyInfo.provider} (${verifyInfo.model})` : '',
    aiSearch: aiResearch?.ok ? `Gemini + Google 검색 (${aiResearch.model})` : '',
    evidenceCount: evidence.length,
    generatedAt: new Date().toISOString(),
  };
  return data;
}

// 성공하면 { ok: true, data, provider, model }, 실패하면 { ok: false, error }
export async function lookupBook({ title, author }) {
  title = title.trim();
  author = author.trim();

  // 1. 근거 수집 — 웹 검색과 AI 검색을 동시에
  const [found, aiResearch] = await Promise.all([
    bookSearch({ title, author }).catch((error) => ({ ok: false, error: error.message })),
    geminiSearchResearch({ title, author }).catch((error) => ({ ok: false, error: error.message })),
  ]);
  if (!aiResearch.ok) console.warn(`[lookup] AI 검색 건너뜀: ${aiResearch.error}`);
  const evidence = found.ok ? [...found.results] : [];
  if (!evidence.length && !aiResearch.ok) {
    return { ok: false, error: `이 책 정보를 웹에서 찾지 못했습니다. (${found.error || '검색 결과 없음'}) 제목과 저자를 다시 확인해주세요.` };
  }
  const aiResearchText = aiResearch.ok ? aiResearch.text : '';
  const providers = availableProviders();

  // 2. 정리 (초안)
  const draft = await runStage({
    label: '정리',
    providers,
    system: draftSystemPrompt(),
    evidence,
    buildUser: (evidenceText) => draftUserPrompt({ title, author, evidenceText, aiResearchText }),
  });
  if (!draft.ok) {
    return { ok: false, error: `AI 정리에 실패했습니다. 잠시 후 다시 시도해주세요.\n${draft.error}` };
  }

  // 3. 단편집이면 편별로 근거 보강 (번호가 바뀌지 않도록 뒤에 덧붙임)
  if (draft.data.parts.length > 1) {
    const extra = await partSearch({
      title, author,
      partTitles: draft.data.parts.map((p) => p.title),
      seen: found.seen,
    }).catch(() => []);
    evidence.push(...extra);
  }

  // 4. 교차 확인 — 근거 전체를 읽을 수 있는 모델만
  const verify = await runStage({
    label: '교차 확인',
    requireFull: true,
    providers,
    system: verifySystemPrompt(),
    evidence,
    buildUser: (evidenceText) => verifyUserPrompt({ title, author, evidenceText, aiResearchText, draft: draft.data }),
  });

  const data = finalize(verify.ok ? verify.data : draft.data, {
    evidence,
    aiResearch,
    draftInfo: draft,
    verifyInfo: verify.ok ? verify : null,
  });
  const lead = verify.ok ? verify : draft;
  return { ok: true, data, provider: lead.provider, model: lead.model };
}
