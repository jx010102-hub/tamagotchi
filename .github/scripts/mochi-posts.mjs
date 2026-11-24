// 유튜브 '영적세계전문가' 채널 커뮤니티 게시물 → 일본어 번역 + 히라가나 → mochi/posts.json (GitHub Actions)
import fs from "node:fs";
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

const SEED_POST = "UgkxDWZ8CzAaLncCvCqw4z7H7v6nTvAQmX2-";
const OUT = "mochi/posts.json", KEEP = 20;
const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "ko-KR,ko;q=0.9", "Cookie": "CONSENT=YES+cb; SOCS=CAI" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function jsonAfter(html, marker){
  const i = html.indexOf(marker); if (i < 0) return null;
  let j = html.indexOf("{", i), depth = 0, inStr = false, esc = false;
  for (let k = j; k < html.length; k++) { const ch = html[k];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (!depth) return JSON.parse(html.slice(j, k + 1)); } }
  return null;
}
function* walk(o, key){ if (!o || typeof o !== "object") return; if (Array.isArray(o)) { for (const x of o) yield* walk(x, key); return; }
  for (const [k, v] of Object.entries(o)) { if (k === key) yield v; yield* walk(v, key); } }
const text = t => t ? (t.simpleText ?? (t.runs || []).map(r => r.text).join("")) : "";
async function get(url){ for (let i = 0; ; i++) { const r = await fetch(url, { headers: H }); if (r.ok) return r.text(); if (r.status !== 429 || i > 2) throw new Error(`${r.status} ${url}`); await sleep(8000 * (i + 1)); } }

const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { posts: [] };
// 1) 채널 찾기 (처음 받은 게시물에서)
let channelId = old.channelId, channelName = old.channelName;
if (!channelId) {
  const html = await get(`https://www.youtube.com/post/${SEED_POST}?hl=ko&gl=KR`);
  const d = jsonAfter(html, "var ytInitialData");
  const p = [...walk(d, "backstagePostRenderer")][0];
  channelId = p?.authorEndpoint?.browseEndpoint?.browseId || (html.match(/"channelId":"(UC[\w-]{22})"/) || [])[1];
  channelName = text(p?.authorText) || "";
  console.log("채널:", channelName, channelId);
}
// 2) 커뮤니티 게시물 목록
const html = await get(`https://www.youtube.com/channel/${channelId}/posts?hl=ko&gl=KR`);
const d = jsonAfter(html, "var ytInitialData");
const found = [...walk(d, "backstagePostRenderer")].map(p => ({
  id: p.postId, text: text(p.contentText).trim(), ago: text(p.publishedTimeText),
  image: ((p.backstageAttachment?.backstageImageRenderer?.image?.thumbnails) || []).slice(-1)[0]?.url || null,
})).filter(p => p.id && p.text);
console.log(`게시물 ${found.length}개`, found.slice(0, 5).map(p => `${p.ago} | ${p.text.slice(0, 40).replace(/\n/g, " ")}`));

// 3) 번역 (구글 번역 무료 엔드포인트) + 히라가나
async function translate(s, tl){
  const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=${tl}&dt=t&q=${encodeURIComponent(s)}`;
  const r = await fetch(u, { headers: { "User-Agent": H["User-Agent"] } }); if (!r.ok) throw new Error("translate " + r.status);
  const j = await r.json(); return (j[0] || []).map(x => x[0]).join("");
}
const kuro = new Kuroshiro.default ? new Kuroshiro.default() : new Kuroshiro();
await kuro.init(new (KuromojiAnalyzer.default || KuromojiAnalyzer)());
const known = new Map(old.posts.map(p => [p.id, p]));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const posts = [];
for (const p of found.slice(0, KEEP)) {
  const k = known.get(p.id);
  if (k && k.text === p.text && k.lines?.length) { posts.push({ ...k, ago: p.ago, image: p.image ?? k.image }); continue; }
  // 문단·문장 단위로 나눠 번역 (줄바꿈 유지)
  const lines = [];
  for (const para of p.text.split(/\n/)) {
    if (!para.trim()) { lines.push({ ko: "", ja: "", ruby: "", kana: "" }); continue; }
    const sents = para.match(/[^.!?。！？]+[.!?。！？"”’」)]*\s*/g) || [para];
    for (const s0 of sents) { const s = s0.trim(); if (!s) continue;
      const ja = await translate(s, "ja"); await sleep(250);
      const ruby = await kuro.convert(ja, { to: "hiragana", mode: "furigana" });
      const kana = await kuro.convert(ja, { to: "hiragana", mode: "spaced" });
      lines.push({ ko: s, ja, ruby, kana }); }
  }
  posts.push({ id: p.id, url: `https://www.youtube.com/post/${p.id}`, text: p.text, ago: p.ago, image: p.image, firstSeen: k?.firstSeen || today, lines });
  console.log(`번역: ${p.text.slice(0, 30).replace(/\n/g, " ")}… (${lines.length}줄)`);
}
const out = { channelId, channelName, posts };
if (JSON.stringify({ ...out }) !== JSON.stringify({ ...old, updated: undefined })) {
  out.updated = new Date().toISOString(); fs.mkdirSync("mochi", { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n"); console.log("저장", posts.length);
}
