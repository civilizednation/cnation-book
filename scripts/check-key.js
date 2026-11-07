// 등록된 키로 실제 조회가 동작하는지 확인하는 스크립트: npm run check
import { lookupBook, validateRequest } from '../lib/book-lookup.js';

const sample = { title: '어린 왕자', author: '앙투안 드 생텍쥐페리' };
const invalid = validateRequest(sample);
if (invalid) {
  console.error(`❌ ${invalid}`);
  process.exit(1);
}

const result = await lookupBook(sample);
if (!result.ok) {
  console.error(`❌ ${result.error}`);
  process.exit(1);
}
const charCount = result.data.parts.reduce((sum, p) => sum + (p.mainCharacters?.length || 0) + (p.supportingCharacters?.length || 0), 0);
console.log(`✅ ${result.provider} (${result.model}) — "${result.data.title}" 조회 성공, ${result.data.parts.length}편, 등장인물 ${charCount}명`);
