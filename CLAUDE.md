# cnation-book 작업 규칙

책 제목/저자를 입력하면 공식적으로 알려진 정보만 모아 소개·평점·등장인물을 정리해주는 앱. 구조는 `README.md` 참고.

## 버전 규칙 (모든 변경 시 반드시 지킬 것)

버전 형식: `Version 1.X.Y`

- **큰 변화** (기능 추가/변경, UI 구조 변경 등) → **두 번째 자리(X)** +1, 세 번째 자리는 0으로
  - 예: 1.1.0 → 1.2.0
- **작은 변화** (버그 수정, 문구/스타일 다듬기 등) → **세 번째 자리(Y)** +1
  - 예: 1.1.0 → 1.1.1

버전을 올릴 때 아래 세 곳을 모두 같은 값으로 수정:

1. `index.html` footer — `cnation Book · v1.X.Y · Revision History`
2. `revision.html` 상단 "현재 버전" 배지 — `현재 버전: Version 1.X.Y`
3. `revision.html` 하단 footer — `Version 1.X.Y`

그리고 `revision.html`의 `<div class="timeline">` 바로 아래(맨 위)에 새 기록 추가:

```html
<div class="entry"><div class="entry-head"><span class="ver">v1.X.Y</span><span class="date">YYYY-MM-DD</span></div><ul>
<li>변경 내용을 한국어로 구체적으로</li>
</ul></div>
```

참고: `package.json`의 `version`은 앱 버전과 별개이므로 건드리지 않는다.

## 작업 마무리

- 사용자가 요청하면 `main` 브랜치에 바로 커밋·푸시한다
- 커밋 메시지는 한국어로 변경 내용을 요약
