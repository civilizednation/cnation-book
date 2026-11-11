# cnation-book

책 제목과 저자를 입력하면, 공식적으로 알려진 정보만 모아 소개·평점·등장인물을 자세히 정리해주는 앱입니다.

https://cnation-book.vercel.app (배포 후)

## 동작 방식

1. 책 제목/저자를 입력하면 먼저 Firestore(`cnation-book-entries` 컬렉션)에 이미 정리된 기록이 있는지 확인합니다.
2. 있으면 바로 보여주고, 없으면 무료 서비스만으로 다음 과정을 거칩니다.
   - **근거 수집 (동시에)**: Tavily로 서점(예스24·교보문고·알라딘) 상세 페이지, 위키(한국어/일본어 위키백과·나무위키), 일반 웹을 따로 검색해 페이지 본문까지 받고, Gemini의 Google 검색 연동으로 "AI 검색 요약"을 한 갈래 더 모읍니다.
   - **정리**: Gemini(실패 시 GitHub Models)가 근거를 종합해 초안 JSON을 만듭니다.
   - **편별 보강**: 단편집이면 편마다 따로 추가 검색합니다.
   - **교차 확인**: 근거 전체를 읽을 수 있는 모델이 초안을 근거와 하나씩 대조해, 근거 없는 내용은 지우고 인물마다 신뢰도(`multi` = 출처 2곳 이상, `single` = 1곳)를 매깁니다.
   - 출처는 AI가 고른 근거 번호를 실제 검색된 URL로 바꿔서 표시합니다 (지어낸 링크 방지). 소형 모델(Groq)은 정확도 문제로 쓰지 않습니다.
3. 결과를 Firestore에 저장해두고 화면에 보여줍니다. 다음에 같은 책을 조회하면 저장된 내용을 그대로 보여줍니다.
4. 홈 화면 하단에는 이미 정리된 책 목록이 떠서, 다시 검색하지 않고도 선택해서 볼 수 있습니다.

## 구조

- `index.html` — 검색 화면 + 정리된 책 목록 + 상세 화면 (Firestore REST API를 fetch로 직접 호출해 읽기/쓰기 — VPN·프록시 환경에서 SDK 스트리밍 연결이 막히는 문제를 피하기 위해 SDK는 쓰지 않음)
- `api/lookup.js` — Vercel 함수: `POST /api/lookup { title, author }` → 구조화된 JSON
- `lib/book-lookup.js` — 조회 오케스트레이션 (근거 수집 → 정리 → 편별 보강 → 교차 확인 → 출처 정리)
- `lib/search.js` — Tavily 웹 검색 (서점·위키·일반 웹을 나눠 병렬 검색, 페이지 본문 포함, 단편별 추가 검색)
- `lib/ai-research.js` — Gemini + Google 검색 연동 "AI 검색 요약" (보조 근거)
- `lib/prompt.js` — 정리·교차 확인 단계의 지시문과 응답 JSON 형식 정의
- `lib/providers/` — Gemini, GitHub Models 호출 (Groq 코드는 남아 있지만 조회에는 쓰지 않음) (구조화된 JSON 한 번에 받기 위해 스트리밍 없이 완결 응답만 사용)
- `fonts/` — 자체 호스팅 전용 폰트 (IBM Plex Sans KR, cnation 공통)

## 응답 JSON 형식 (`lib/prompt.js` 참고)

책이 단편집처럼 여러 편으로 나뉘어 있으면 `parts` 배열에 편마다 하나씩, 보통의 장편소설이면 `parts`에 항목을 하나만 만듭니다. 각 편은 사건 개요(`premise`), 주요 인물(`mainCharacters`: 신분·가족관계·직업·사건 역할을 bullet로), 추가 인물(`supportingCharacters`: 이름+관계만 간단히), 인물 관계 요약(`relationshipSummary`)을 담습니다. `accuracyNote`에 어디까지 공식 확인된 정보인지 명시하고, `spoilerNote`로 범인·반전을 밝히지 않았음을 안내합니다.

## 로컬 실행

```bash
cp .env.example .env   # 키 입력 (GEMINI_API_KEY, GITHUB_MODELS_TOKEN, TAVILY_API_KEY)
npm run dev             # http://localhost:3000
npm run check            # 등록된 키로 실제 조회 테스트 ("어린 왕자"로 확인)
```

## Firebase

cnation 패밀리 앱들이 공유하는 Firebase 프로젝트(`cnation-project`)를 그대로 사용합니다. 이 프로젝트의 Firestore 보안 규칙이 `cnation-book-entries` 컬렉션에 대한 읽기/쓰기를 허용하는지 Firebase 콘솔에서 확인이 필요할 수 있습니다.
