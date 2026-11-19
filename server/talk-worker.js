/**
 * 성장 다마고치 — AI 말풍선 대사 서버 (Cloudflare Workers)
 *
 * 앱(GitHub Pages)은 API 키를 갖고 있지 않아요. 앱은 이 서버로 "상황 정보"만 보내고,
 * 이 서버가 비밀 변수에 저장된 키로 Claude API를 불러 새 대사를 만들어 돌려줘요.
 *
 * 배포 방법 (한 번만)
 *   1) npm i -g wrangler && wrangler login
 *   2) 이 폴더에서: wrangler deploy server/talk-worker.js --name tamagotchi-talk --compatibility-date 2026-11-01
 *   3) wrangler secret put ANTHROPIC_API_KEY --name tamagotchi-talk   (키는 여기에만 입력)
 *   4) 나온 주소(https://tamagotchi-talk.<계정>.workers.dev)를 앱 설정 > 마을 배경 > AI 대사 서버에 넣기
 * 선택 변수: ALLOWED_ORIGIN (기본 https://jx010102-hub.github.io), MODEL (기본 claude-haiku-5-5)
 *
 * 요청:  POST { version: 1, items: [ { character_id, character_name, personality, speech_style,
 *          skill_category, event_type, fallback_line, today_schedule, completion_status,
 *          weekly_progress, recent_achievements }, ... ] }
 * 응답:  { lines: [ "대사", ... ] }   (items와 같은 순서·개수. 앱이 다시 검사하고, 이상하면 준비된 대사를 써요)
 */
const SYSTEM = `너는 다마고치 성장 앱 속 캐릭터들의 대사 작가야.
입력은 JSON 배열이고, 각 항목마다 그 캐릭터가 지금 할 말풍선 대사 1개를 써.

규칙
- 항목의 personality와 speech_style을 그대로 지켜. 캐릭터끼리 말투가 비슷해지면 안 돼.
  둥둥이=느낌표·의성어 폭발 락스타 / 콩이=능청스러운 자칭 천재 작가 / 릴리=새침한 뷰티 덕후, 주인을 '언니'라 부름 / 모찌=짧고 건조한 츤데레.
- 모두 친근한 반말. 장난스럽고 병맛 유머 OK. 교과서 같은 자기계발 응원 문구, 정중한 말투 금지.
- 욕설·인신공격·심한 비난 금지. 못 했어도 가볍게 놀리고 다시 하게 유도만.
- event_type과 fallback_line이 말하는 사실만 써. 일정·기록·숫자를 지어내거나 바꾸지 마.
  계획만 있는 일을 했다고 말하지 마. fallback_line에 없는 숫자는 쓰지 마.
- 1~2문장, 60자 이내. 이모지는 0~2개. HTML·따옴표·이름표 없이 대사만.
- 모찌가 일본어를 쓰면 히라가나와 짧은 뜻을 괄호로: 例) 頑張って(がんばって·힘내)
- 자신 없으면 fallback_line을 살짝만 바꿔.

출력: 입력과 같은 개수·순서의 JSON 문자열 배열만. 예) ["대사1","대사2"]`;

export default {
  async fetch(req, env) {
    const allowed = env.ALLOWED_ORIGIN || "https://jx010102-hub.github.io";
    const cors = { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST" || req.headers.get("Origin") !== allowed) return json({ error: "forbidden" }, 403);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "no key" }, 500);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 12).map(clean);
    if (!items.length) return json({ lines: [] });

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: env.MODEL || "claude-haiku-5-5", max_tokens: 900, system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(items) }] }),
      });
      if (!r.ok) return json({ lines: [] });
      const data = await r.json();
      const text = (data.content || []).map(c => c.text || "").join("");
      const m = text.match(/\[[\s\S]*\]/);
      const arr = m ? JSON.parse(m[0]) : [];
      const lines = items.map((_, i) => typeof arr[i] === "string" && arr[i].trim().length <= 70 ? arr[i].trim() : null);
      return json({ lines });
    } catch {
      return json({ lines: [] });   // 앱은 준비된 대사로 계속 동작
    }
  },
};

// 필요한 필드만, 길이 제한해서 전달
function clean(x) {
  const s = (v, n = 200) => String(v ?? "").slice(0, n);
  return {
    character_id: s(x.character_id, 10), character_name: s(x.character_name, 10),
    personality: s(x.personality, 300), speech_style: s(x.speech_style, 300), skill_category: s(x.skill_category, 20),
    event_type: s(x.event_type, 20), fallback_line: s(x.fallback_line, 120),
    today_schedule: (Array.isArray(x.today_schedule) ? x.today_schedule : []).slice(0, 15),
    completion_status: x.completion_status || {}, weekly_progress: s(x.weekly_progress, 80),
    recent_achievements: (Array.isArray(x.recent_achievements) ? x.recent_achievements : []).slice(0, 5),
  };
}
