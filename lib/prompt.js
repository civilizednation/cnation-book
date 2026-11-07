// 책 조회용 프롬프트. 두 단계로 나뉩니다.
// 1) 정리(draft): 여러 갈래로 모은 근거 자료를 종합해 구조화된 JSON 초안을 만듭니다.
// 2) 교차 확인(verify): 초안의 모든 인물·설명을 근거 자료와 하나씩 대조해, 근거 없는 내용은 지우고
//    출처가 몇 곳인지에 따라 신뢰도를 표시한 최종본을 만듭니다.
// 출처 URL은 AI가 직접 쓰지 않고 근거 번호(ref)만 고르게 해서, 존재하지 않는 링크가 나오지 않게 합니다.
const JSON_SHAPE = `{
  "title": "정식 제목 (한국어판이 있으면 한국어 제목)",
  "author": "저자",
  "originalTitle": "원제 (한국어 제목과 다를 때만, 없으면 빈 문자열)",
  "publisher": "국내 출판사 (근거에 없으면 빈 문자열)",
  "publishedDate": "국내 출간일 또는 연도 (근거에 없으면 빈 문자열)",
  "genre": "장르 (근거에 없으면 빈 문자열)",
  "format": "책의 구성 (예: '추리 단편 5편', '장편소설')",
  "summary": "책 전체 소개. 2~4문단, 문단 구분은 \\n\\n",
  "rating": { "score": "평점 숫자 (근거에 없으면 빈 문자열)", "scale": "예: 10점 만점", "source": "평점 출처 사이트명" },
  "accuracyNote": "어떤 정보가 출판사·서점 공식 소개로 확인됐고, 어떤 정보가 독자 작성 목록·위키·AI 검색 등 보조 자료에서 왔는지 구분해서 설명 (한두 문장)",
  "spoilerNote": "범인이나 결정적 반전은 밝히지 않았다는 안내 (한 문장)",
  "parts": [
    {
      "title": "편 제목 — 단편집이 아니면 책 제목과 동일",
      "originalTitle": "편의 원제 (없으면 빈 문자열)",
      "premise": "사건의 중심이 되는 전제/줄거리 개요 (범인·최종 반전 제외)",
      "mainCharacters": [
        {
          "name": "이름 (가능하면 성과 이름 모두)",
          "role": "이 편에서의 역할 (예: 의뢰인, 피해자, 용의자, 탐정)",
          "points": ["신분이나 직업", "가족관계", "사건에서 하는 일이나 관련 정황", "그 외 특징"],
          "confidence": "multi | single — 서로 다른 근거 2곳 이상에서 확인되면 multi, 1곳뿐이면 single",
          "refs": [1, 3]
        }
      ],
      "supportingCharacters": [
        { "name": "이름", "relation": "관계 및 역할 (간단히)", "confidence": "multi | single" }
      ],
      "relationshipSummary": "이 편 인물 관계 핵심 요약 (두세 문장)"
    }
  ],
  "readingTips": ["인물이 많을 때 구분해서 기억하면 좋은 기준 1~3개"],
  "sources": [ { "ref": 1, "note": "이 근거에서 무엇을 확인했는지 한 줄 (예: 출판사 책 소개, 독자 작성 인물 목록)" } ],
  "notice": "확인하지 못한 부분이나 유의할 점 (없으면 빈 문자열)"
}`;

const COMMON_RULES =
  '절대 원칙:\n' +
  '- 오직 아래에 주어진 근거 자료에 실제로 적혀 있는 내용만 쓰세요. 당신이 원래 알고 있는 지식이나 그럴듯한 추측으로 채우지 마세요.\n' +
  '- 근거가 부족하면 빈칸으로 두거나 항목을 빼고, notice에 "확인되지 않음"이라고 솔직하게 쓰세요. 부실하게 지어낸 내용보다 빈칸이 낫습니다.\n' +
  '- 단편집·연작은 parts에 편마다 하나씩 만들고, 인물은 반드시 근거에서 그 편에 나온다고 확인된 경우에만 그 편에 넣으세요. 다른 편 인물을 섞지 마세요.\n' +
  '- 등장인물 이름은 근거에 적힌 한국어판 표기를 그대로 쓰세요.\n' +
  '- 범인, 진범, 결정적 반전, 결말은 절대 밝히지 마세요.\n' +
  '- "AI 검색 요약"은 보조 자료입니다. 그 내용은 다른 근거(서점·위키·웹 페이지)와 맞을 때만 쓰고, 그것에만 있는 내용은 confidence를 single로 하거나 빼세요.\n' +
  '- sources와 refs에는 근거 자료의 번호만 쓰세요. URL을 직접 쓰지 마세요.\n';

export function draftSystemPrompt() {
  return (
    '당신은 책 등장인물을 깊이 있게 정리하는 전문 조사원입니다. 여러 서점·위키·웹 페이지와 AI 검색 요약을 ' +
    '종합해서, 독자가 믿고 쓸 수 있을 만큼 정확하고 자세하게 정리합니다.\n\n' +
    COMMON_RULES +
    '\n작성 지침:\n' +
    '- mainCharacters의 points에는 신분/직업, 가족관계, 사건에서의 역할, 기타 특징을 각각 별도 항목으로 나눠 자세히 쓰세요 (근거에서 확인된 것만).\n' +
    '- 비중이 작은 인물은 supportingCharacters에 이름과 관계만 간단히 정리하세요.\n' +
    '- confidence와 refs는 각 인물이 실제로 확인된 근거 번호를 기준으로 정직하게 쓰세요.\n\n' +
    '응답은 다른 설명 없이 아래 JSON 형식 그대로만 출력하세요:\n' + JSON_SHAPE
  );
}

export function verifySystemPrompt() {
  return (
    '당신은 책 정보의 사실 확인(팩트체크) 담당 편집자입니다. 다른 조사원이 만든 초안 JSON을 근거 자료와 ' +
    '한 줄씩 대조해 최종본을 만듭니다.\n\n' +
    COMMON_RULES +
    '\n검증 절차:\n' +
    '1. 편 구성(parts의 수와 제목·원제)이 근거의 목차·수록작과 맞는지 확인하고, 틀리면 고치세요.\n' +
    '2. 각 인물이 정말 그 편에 나오는지 근거에서 확인하세요. 근거에서 찾을 수 없는 인물은 삭제하고, 다른 편 인물이면 올바른 편으로 옮기세요.\n' +
    '3. 각 인물의 points 하나하나를 근거와 대조하세요. 근거와 다른 내용은 근거대로 고치고, 근거가 없는 내용은 지우세요. 근거에 더 자세한 정보가 있으면 보충하세요.\n' +
    '4. premise, summary, relationshipSummary, 출판 정보, 평점도 같은 방식으로 확인하세요.\n' +
    '5. confidence와 refs를 실제로 확인된 근거 번호 기준으로 다시 매기세요 (서로 다른 사이트 2곳 이상 = multi).\n' +
    '6. 지우거나 확인하지 못한 중요한 부분이 있으면 notice에 간단히 적으세요.\n\n' +
    '응답은 다른 설명 없이 최종본을 아래 JSON 형식 그대로만 출력하세요:\n' + JSON_SHAPE
  );
}

function evidenceBlock({ evidenceText, aiResearchText }) {
  return (
    `=== 근거 자료 (번호로 인용) ===\n${evidenceText}\n\n` +
    (aiResearchText ? `=== AI 검색 요약 (Gemini + Google 검색, 보조 자료 — 다른 근거와 교차 확인 필요) ===\n${aiResearchText}\n\n` : '')
  );
}

export function draftUserPrompt({ title, author, evidenceText, aiResearchText }) {
  return (
    `책 제목: ${title}\n저자: ${author}\n\n` +
    evidenceBlock({ evidenceText, aiResearchText }) +
    '위 자료를 종합해 JSON 형식에 맞춰 자세히 정리해주세요.'
  );
}

export function verifyUserPrompt({ title, author, evidenceText, aiResearchText, draft }) {
  return (
    `책 제목: ${title}\n저자: ${author}\n\n` +
    evidenceBlock({ evidenceText, aiResearchText }) +
    `=== 검증할 초안 ===\n${JSON.stringify(draft)}\n\n` +
    '초안을 근거 자료와 대조해 고친 최종본 JSON을 출력해주세요.'
  );
}
