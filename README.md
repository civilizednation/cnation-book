# cnation-book

책 제목과 저자를 입력하면, 공식적으로 알려진 정보만 모아 소개·평점·등장인물을 자세히 정리해주는 앱입니다.

https://cnation-book.vercel.app (배포 후)

## 동작 방식

1. 책 제목/저자를 입력하면 먼저 Firestore(`cnation-book-entries` 컬렉션)에 이미 정리된 기록이 있는지 확인합니다.
2. 있으면 바로 보여주고, 없으면 Tavily로 웹 검색 → Gemini → GitHub Models → Groq 순으로 AI에게 검색 결과를 근거로 구조화된 JSON을 만들게 합니다.
3. 결과를 Firestore에 저장해두고 화면에 보여줍니다. 다음에 같은 책을 조회하면 저장된 내용을 그대로 보여줍니다.
4. 홈 화면 하단에는 이미 정리된 책 목록이 떠서, 다시 검색하지 않고도 선택해서 볼 수 있습니다.

## 구조

- `index.html` — 검색 화면 + 정리된 책 목록 + 상세 화면 (Firebase 클라이언트 SDK로 직접 Firestore 읽기/쓰기)
- `api/lookup.js` — Vercel 함수: `POST /api/lookup { title, author }` → 구조화된 JSON
- `lib/book-lookup.js` — 조회 오케스트레이션 (검색 → AI 순차 시도 → JSON 파싱, 실패 시 다음 AI로)
- `lib/search.js` — Tavily 웹 검색 (소개/평점용, 등장인물용 질의를 나눠 병렬 검색 후 병합)
- `lib/prompt.js` — AI에게 보낼 지시문과 응답 JSON 형식 정의
- `lib/providers/` — Gemini, GitHub Models, Groq 호출 (구조화된 JSON 한 번에 받기 위해 스트리밍 없이 완결 응답만 사용)
- `fonts/` — 자체 호스팅 전용 폰트 (IBM Plex Sans KR, cnation 공통)

## 응답 JSON 형식 (`lib/prompt.js` 참고)

책이 단편집처럼 여러 편으로 나뉘어 있으면 `parts` 배열에 편마다 하나씩, 보통의 장편소설이면 `parts`에 항목을 하나만 만듭니다. 각 편은 사건 개요(`premise`), 주요 인물(`mainCharacters`: 신분·가족관계·직업·사건 역할을 bullet로), 추가 인물(`supportingCharacters`: 이름+관계만 간단히), 인물 관계 요약(`relationshipSummary`)을 담습니다. `accuracyNote`에 어디까지 공식 확인된 정보인지 명시하고, `spoilerNote`로 범인·반전을 밝히지 않았음을 안내합니다.

## 로컬 실행

```bash
cp .env.example .env   # 키 입력 (GEMINI_API_KEY, GITHUB_MODELS_TOKEN, GROQ_API_KEY, TAVILY_API_KEY)
npm run dev             # http://localhost:3000
npm run check            # 등록된 키로 실제 조회 테스트 ("어린 왕자"로 확인)
```

## Firebase

cnation 패밀리 앱들이 공유하는 Firebase 프로젝트(`cnation-project`)를 그대로 사용합니다. 이 프로젝트의 Firestore 보안 규칙이 `cnation-book-entries` 컬렉션에 대한 읽기/쓰기를 허용하는지 Firebase 콘솔에서 확인이 필요할 수 있습니다.
