// AI 응답에서 JSON 부분만 뽑아 파싱합니다. 모델이 지시를 어기고
// ```json 코드 블록이나 앞뒤 설명을 덧붙이는 경우를 대비합니다.
export function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonSlice = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonSlice);
}
