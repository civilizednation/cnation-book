// 외부 API 호출이 응답 없이 멈추는 것을 막는 타임아웃 fetch 래퍼.
// Vercel 함수는 전체 실행 시간이 제한되는데(vercel.json의 maxDuration), 평범한 fetch는 기본 타임아웃이 없어서
// 상대 서버가 응답하지 않으면 함수가 강제 종료될 때까지 그대로 멈춰버립니다. 이를 막기 위해
// 일정 시간 안에 응답이 없으면 직접 중단시킵니다.
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`요청 시간 초과 (${Math.round(timeoutMs / 1000)}초)`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
