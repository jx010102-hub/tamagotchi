// 예수사랑교회 유튜브 채널에서 "[예수사랑교회 성금요일 총체적 치유 찬양기도회]" 영상들의
// 챕터(곡 제목 + 시작 시각)를 모아 worship/songs.json 으로 저장해요. (GitHub Actions에서 실행)
// 앱은 이 파일만 읽어서 콘티 곡을 찾아요. API 키 필요 없음.
import fs from "node:fs";

const HANDLE = "@jesuslovechurch6503";
const TITLE_KEY = "성금요일총체적치유찬양기도회";      // 공백 무시하고 비교
const OUT = "worship/songs.json";
const MAX_PAGES = 40;          // 채널 영상 목록 최대 페이지(페이지당 ~30개)
const KEEP = 80;               // 최근 영상 몇 개까지 보관
let CTX = null, KEY = null;   // 유튜브 내부 API 정보 (첫 페이지에서 얻음)
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
  "Cookie": "CONSENT=YES+cb; SOCS=CAI",
};
const norm = s => (s || "").replace(/\s+/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));

function jsonAfter(html, marker){
  const i = html.indexOf(marker); if (i < 0) return null;
  let j = html.indexOf("{", i), depth = 0, inStr = false, esc = false;
  for (let k = j; k < html.length; k++) {
    const ch = html[k];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (!depth) return JSON.parse(html.slice(j, k + 1)); }
  }
  return null;
}
function* walk(o, key){
  if (!o || typeof o !== "object") return;
  if (Array.isArray(o)) { for (const x of o) yield* walk(x, key); return; }
  for (const [k, v] of Object.entries(o)) { if (k === key) yield v; yield* walk(v, key); }
}
const text = t => t ? (t.simpleText ?? (t.runs || []).map(r => r.text).join("")) : "";

async function getHtml(url){
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.ok) return r.text();
    if (r.status !== 429 || i >= 2) throw new Error(`${r.status} ${url}`);
    await sleep(8000 * (i + 1));   // 너무 빨리 물어봤다고 하면 잠깐 쉬었다가
  }
}
async function api(path, body){
  const r = await fetch(`https://www.youtube.com/youtubei/v1/${path}?key=${KEY}&prettyPrint=false`, {
    method: "POST", headers: { ...HEADERS, "Content-Type": "application/json", "X-YouTube-Client-Name": "1", "X-YouTube-Client-Version": CTX.client.clientVersion, "Origin": "https://www.youtube.com" },
    body: JSON.stringify({ context: CTX, ...body }),
  });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

function collect(data, vids){
  for (const v of walk(data, "videoRenderer")) vids.push({ id: v.videoId, title: text(v.title) });
  for (const v of walk(data, "playlistVideoRenderer")) vids.push({ id: v.videoId, title: text(v.title) });
  for (const l of walk(data, "lockupViewModel")) { const t = l.metadata?.lockupMetadataViewModel?.title?.content; if (l.contentId && t) vids.push({ id: l.contentId, title: t }); }
}
const nextToken = data => [...walk(data, "continuationItemRenderer")].map(c => c.continuationEndpoint?.continuationCommand?.token).filter(Boolean).pop();
// 한 페이지(HTML) + '더 보기'로 이어지는 페이지들 읽기
async function crawl(label, url, maxPages){
  const vids = [];
  try {
    const html = await getHtml(url);
    if (!KEY) {
      KEY = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
      const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || "2.20240601.00.00";
      CTX = jsonAfter(html, '"INNERTUBE_CONTEXT":') || { client: { clientName: "WEB", clientVersion: ver } };
      CTX.client = { ...CTX.client, hl: "ko", gl: "KR" };
    }
    let data = jsonAfter(html, "var ytInitialData"), page = 1;
    if (!data) throw new Error("ytInitialData 없음");
    collect(data, vids);
    for (let tok = nextToken(data); tok && KEY && page < maxPages; tok = nextToken(data)) {
      await sleep(700); page++;
      data = await api("browse", { continuation: tok });
      const n = vids.length; collect(data, vids);
      if (vids.length === n) break;
    }
    console.log(`  ${label}: ${page}페이지, 영상 ${vids.length}개`);
  } catch (e) { console.log(`  ${label} 실패: ${e.message}`); }
  return vids;
}
async function listVideos(){
  const latest = await crawl("최신 영상", `https://www.youtube.com/${HANDLE}/videos?hl=ko&gl=KR`, 1);
  const found = await crawl("채널 안 검색", `https://www.youtube.com/${HANDLE}/search?query=${encodeURIComponent("성금요일 총체적 치유 찬양기도회")}&hl=ko&gl=KR`, 8);
  let uploads = [];
  const cid = CTX && (await getHtml(`https://www.youtube.com/${HANDLE}?hl=ko`).then(h => (h.match(/"externalId":"(UC[\w-]{22})"/) || h.match(/"channelId":"(UC[\w-]{22})"/) || [])[1]).catch(() => null));
  if (cid) uploads = await crawl("전체 업로드", `https://www.youtube.com/playlist?list=UU${cid.slice(2)}&hl=ko&gl=KR`, 6);
  const seen = new Set();
  return [...latest, ...found, ...uploads].filter(v => v.id && !seen.has(v.id) && seen.add(v.id));
}

function parseTime(s){
  const p = s.split(":").map(Number); if (p.some(isNaN)) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}
function chaptersFromDescription(desc){
  const out = [];
  for (const line of (desc || "").split("\n")) {
    const m = line.match(/^\s*[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*[-–—:.)]?\s*(.+)$/) || line.match(/^\s*(.+?)\s*[-–—:]?\s*[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*$/);
    if (!m) continue;
    const [ts, title] = /\d:\d{2}/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const t = parseTime(ts); if (t == null || !title.trim()) continue;
    out.push({ t, title: title.trim() });
  }
  return out;
}
async function videoDetail(id){
  let init = null, player = null;
  try {
    const html = await getHtml(`https://www.youtube.com/watch?v=${id}&hl=ko&gl=KR`);
    init = jsonAfter(html, "var ytInitialData"); player = jsonAfter(html, "var ytInitialPlayerResponse");
  } catch (e) {
    console.log(`  영상 페이지 실패(${e.message}) → 내부 API로 시도`);
    init = await api("next", { videoId: id });
    try { player = await api("player", { videoId: id }); } catch (e2) { player = null; }
  }
  let chapters = [];
  for (const c of walk(init, "chapterRenderer")) chapters.push({ t: Math.round((c.timeRangeStartMillis || 0) / 1000), title: text(c.title) });
  if (!chapters.length) for (const m of walk(init, "macroMarkersListItemRenderer")) {
    const t = m.onTap?.watchEndpoint?.startTimeSeconds; if (t != null) chapters.push({ t, title: text(m.title) });
  }
  const desc = player?.videoDetails?.shortDescription || [...walk(init, "attributedDescriptionBodyText")].map(x => x.content).join("\n") || "";
  if (!chapters.length) chapters = chaptersFromDescription(desc);
  const seen = new Set(); chapters = chapters.filter(c => c.title && !seen.has(c.t + c.title) && seen.add(c.t + c.title)).sort((a, b) => a.t - b.t);
  const mf = player?.microformat?.playerMicroformatRenderer || {};
  const dateText = mf.publishDate || mf.uploadDate || [...walk(init, "dateText")].map(text)[0] || "";
  const dm = String(dateText).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return { date: dm ? `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}` : "", title: player?.videoDetails?.title || [...walk(init, "videoPrimaryInfoRenderer")].map(x => text(x.title))[0], chapters };
}

const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { videos: [] };
const known = new Map((old.videos || []).map(v => [v.id, v]));
const all = await listVideos();
const hits = all.filter(v => norm(v.title).includes(TITLE_KEY));
console.log(`채널 영상 ${all.length}개 중 찬양기도회 ${hits.length}개`);
const videos = [];
for (const v of hits.slice(0, KEEP)) {
  const k = known.get(v.id);
  if (k && k.chapters?.length && /^\d{4}-\d{2}-\d{2}$/.test(k.date || "")) { videos.push({ ...k, title: v.title || k.title }); continue; }
  try {
    await sleep(2500);
    const d = await videoDetail(v.id);
    videos.push({ id: v.id, title: d.title || v.title, date: d.date, chapters: d.chapters });
    console.log(`  ${d.date} ${v.title} — 챕터 ${d.chapters.length}개: ${d.chapters.slice(0, 4).map(c => c.title).join(" | ")}`);
  } catch (e) { console.log(`  실패 ${v.id}: ${e.message}`); if (k) videos.push(k); }
}
// 목록에서 사라진(오래된) 것도 기존 데이터는 남겨둠
for (const k of known.values()) if (!videos.some(v => v.id === k.id)) videos.push(k);
videos.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const out = { channel: HANDLE, titleKey: "[예수사랑교회 성금요일 총체적 치유 찬양기도회]", videos: videos.slice(0, KEEP) };
const total = out.videos.reduce((a, v) => a + (v.chapters?.length || 0), 0);
if (!total) { console.error("챕터를 하나도 못 가져와서 이번엔 저장하지 않아요"); process.exit(known.size ? 0 : 1); }
out.videos = out.videos.filter(v => v.chapters?.length);
const prev = JSON.stringify({ ...old, updated: undefined });
if (JSON.stringify({ ...out, updated: undefined }) !== prev || !old.updated) {
  out.updated = new Date().toISOString();
  fs.mkdirSync("worship", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`저장: 영상 ${out.videos.length}개, 챕터 ${out.videos.reduce((a, v) => a + v.chapters.length, 0)}개`);
} else console.log("변경 없음");
if (!hits.length && !known.size) { console.error("찬양기도회 영상을 하나도 못 찾았어요"); process.exit(1); }
