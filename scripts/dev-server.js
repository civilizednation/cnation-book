// 로컬 실행용 서버 (의존성 없음): npm run dev -> http://localhost:3000
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { lookupBook, validateRequest } from '../lib/book-lookup.js';

const PORT = Number(process.env.PORT) || 3000;
const indexUrl = new URL('../index.html', import.meta.url);

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  try {
    if (req.url === '/api/lookup') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST 요청만 허용됩니다.' });
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload = {};
      try {
        payload = JSON.parse(raw || '{}');
      } catch {
        return sendJson(res, 400, { ok: false, error: '잘못된 JSON 형식입니다.' });
      }
      const invalid = validateRequest(payload);
      if (invalid) return sendJson(res, 400, { ok: false, error: invalid });
      const result = await lookupBook(payload);
      return sendJson(res, result.ok ? 200 : 502, result);
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(indexUrl));
    }

    sendJson(res, 404, { error: 'Not Found' });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: '서버 내부 오류가 발생했습니다.' });
  }
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT} 에서 실행 중`);
  if (!process.env.GEMINI_API_KEY && !process.env.GITHUB_MODELS_TOKEN && !process.env.GROQ_API_KEY) console.warn('⚠️  AI 키가 없습니다. .env 파일을 확인하세요.');
  if (!process.env.TAVILY_API_KEY) console.warn('⚠️  TAVILY_API_KEY가 없습니다. 이 앱은 웹 검색이 필수입니다.');
});
