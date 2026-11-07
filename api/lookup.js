// Vercel 서버리스 함수: POST /api/lookup { "title": "...", "author": "..." }
// -> { ok: true, data: {...}, provider, model } 또는 { ok: false, error }
import { lookupBook, validateRequest } from '../lib/book-lookup.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: 'POST 요청만 허용됩니다.' }));
  }
  const invalid = validateRequest(req.body ?? {});
  if (invalid) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: invalid }));
  }
  try {
    const result = await lookupBook(req.body);
    res.writeHead(result.ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('책 조회 중 오류:', error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '서버 내부 오류가 발생했습니다.' }));
  }
}
