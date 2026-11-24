// 유튜브 '영적세계전문가' 채널 커뮤니티 게시물 → 일본어 번역 + 히라가나 → mochi/posts.json (GitHub Actions)
import fs from "node:fs";
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

const SEED_POST = "UgkxDWZ8CzAaLncCvCqw4z7H7v6nTvAQmX2-";
const OUT = "mochi/posts.json", KEEP = 20, NEW_PER_RUN = 3;   // 한 번에 새로 번역하는 글은 최근 3개까지 (나머지는 다음 실행에)
const T = ms => AbortSignal.timeout(ms);
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
// 글 끝의 링크·SNS 안내(📌 영상 제목 + 주소들)는 빼고 본문만 남겨요
const LINKY = /https?:|www\.|youtu\.|\.(com|kr|net|co)\b|^\s*(be|com|org)\/|@\w/i;
const TITLE_LEAD = /^\s*(?:[\p{Extended_Pictographic}\uFE0F\u200D]|\[|【|▶|➡)/u;
function cutBody(lines, get = x => x){
  let i = lines.findIndex(l => LINKY.test(get(l)));
  if (i < 0) i = lines.length;
  let out = lines.slice(0, i);
  const blank = l => !get(l).trim();
  while (out.length && blank(out[out.length - 1])) out.pop();
  while (out.length && TITLE_LEAD.test(get(out[out.length - 1])) && i < lines.length) out.pop();   // 링크 바로 위 제목 줄
  while (out.length && blank(out[out.length - 1])) out.pop();
  return out;
}
const cleanText = t => cutBody(t.split("\n")).join("\n").trim();
const text = t => t ? (t.simpleText ?? (t.runs || []).map(r => r.text).join("")) : "";
async function get(url){ for (let i = 0; ; i++) { const r = await fetch(url, { headers: H, signal: T(20000) }); if (r.ok) return r.text(); if (r.status !== 429 || i > 2) throw new Error(`${r.status} ${url}`); await sleep(8000 * (i + 1)); } }

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
})).map(p => ({ ...p, text: cleanText(p.text) })).filter(p => p.id && p.text);
console.log(`게시물 ${found.length}개`, found.slice(0, 5).map(p => `${p.ago} | ${p.text.slice(0, 40).replace(/\n/g, " ")}`));

// 3) 번역 (구글 번역 무료 엔드포인트) + 히라가나
// 게시물 하나를 한 번에 번역 (문장마다 줄을 나눠 보내고, 같은 순서로 받기)
const SEP = "\n";
async function googleT(sents){
  const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=ja&dt=t`;
  for (let i = 0; i < 2; i++) {
    const r = await fetch(u, { method: "POST", headers: { "User-Agent": H["User-Agent"], "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: "q=" + encodeURIComponent(sents.join(SEP)), signal: T(20000) });
    if (r.ok) { const j = await r.json(); const out = (j[0] || []).map(x => x[0]).join("").split(SEP).map(x => x.trim()); if (out.length === sents.length) return out; throw new Error("google 줄 수 불일치 " + out.length + "/" + sents.length); }
    if (r.status !== 429) throw new Error("google " + r.status);
    console.log("  구글 429 → 잠깐 쉬었다가 다시"); await sleep(5000);
    if (i >= 1) break;
  }
  throw new Error("google 429");
}
async function myMemoryT(sents){
  const out = [];
  for (const s of sents) { const r = await fetch(`https://api.mymemory.translated.net/get?langpair=ko|ja&de=mochi-bot@users.noreply.github.com&q=${encodeURIComponent(s.slice(0, 480))}`, { signal: T(15000) });
    const j = await r.json(); if (!r.ok || j.responseStatus != 200) throw new Error("mymemory " + (j.responseDetails || r.status)); out.push(j.responseData.translatedText); await sleep(400); }
  return out;
}
async function translateAll(sents){
  try { return { ja: await googleT(sents), via: "google" }; }
  catch (e) { console.log("  " + e.message + " → MyMemory로"); return { ja: await myMemoryT(sents), via: "mymemory" }; }
}
const KA = KuromojiAnalyzer.default || KuromojiAnalyzer;
const kuro = new Kuroshiro.default ? new Kuroshiro.default() : new Kuroshiro();
await kuro.init(new KA());
const an = new KA(); await an.init();
const k2h = s => (s || "").replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const HAS_KANJI = /[\u4e00-\u9fff々]/;
// 문장 → 낱말들 [보이는 글자, 읽는 법(한자 있을 때만), 사전 키(뜻 볼 수 있는 낱말만)]
async function tokenize(ja){
  const out = [];
  for (const t of await an.parse(ja)) {
    const sf = t.surface_form, base = t.basic_form && t.basic_form !== "*" ? t.basic_form : sf;
    const content = ["名詞", "動詞", "形容詞", "副詞", "連体詞"].includes(t.pos) && !["非自立", "数", "接尾", "代名詞", "サ変接続"].includes(t.pos_detail_1)
      && /[\u3041-\u30ff\u4e00-\u9fff]/.test(base) && !(base.length === 1 && !HAS_KANJI.test(base));
    out.push([sf, HAS_KANJI.test(sf) ? k2h(t.reading || "") : "", content ? base : ""]);
  }
  return out;
}
const known = new Map(old.posts.map(p => [p.id, p]));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const posts = []; let fresh = 0;
for (const p of found.slice(0, KEEP)) {
  const k = known.get(p.id);
  // 이미 번역한 글: 다시 번역하지 않고 링크 부분만 잘라서 정리
  if (k && k.lines?.length && (k.text === p.text || cleanText(k.text) === p.text)) { posts.push({ ...k, text: p.text, lines: cutBody(k.lines, l => l.ko), ago: p.ago, image: p.image ?? k.image }); continue; }
  if (fresh >= NEW_PER_RUN) { if (k) posts.push(k); continue; }
  fresh++;
  // 문단·문장 단위로 나눠 번역 (빈 줄은 문단 구분으로 유지)
  const parts = [];
  for (const para of p.text.split(/\n/)) {
    if (!para.trim()) { parts.push(null); continue; }
    for (const s0 of (para.match(/[^.!?。！？]+[.!?。！？"”’」)]*\s*/g) || [para])) { const s = s0.trim(); if (s) parts.push(s); }
  }
  let tr;
  try { tr = await translateAll(parts.filter(Boolean)); }
  catch (e) { console.log("번역 실패, 다음에 다시:", e.message); if (k) posts.push(k); continue; }
  let ti = 0; const lines = [];
  for (const s of parts) {
    if (s === null) { lines.push({ ko: "", ja: "", ruby: "", kana: "" }); continue; }
    const ja = tr.ja[ti++] || "";
    lines.push({ ko: s, ja, ruby: await kuro.convert(ja, { to: "hiragana", mode: "furigana" }), kana: await kuro.convert(ja, { to: "hiragana", mode: "spaced" }), t: await tokenize(ja) });
  }
  await sleep(1500);
  posts.push({ id: p.id, url: `https://www.youtube.com/post/${p.id}`, text: p.text, ago: p.ago, image: p.image, firstSeen: k?.firstSeen || today, via: tr.via, lines });
  console.log(`번역: ${p.text.slice(0, 30).replace(/\n/g, " ")}… (${lines.length}줄)`);
}
// 모든 글에 낱말 나누기 (예전 글 포함, 번역은 다시 안 함)
for (const p of posts) for (const l of p.lines) if (l.ja && !l.t) l.t = await tokenize(l.ja);

// ---- 한자 JLPT 급수 (한 번만 받아 둠) ----
const KJ = "mochi/kanji.json";
let kanji = fs.existsSync(KJ) ? JSON.parse(fs.readFileSync(KJ, "utf8")) : null;
if (!kanji) {
  try { const r = await fetch("https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json", { signal: T(30000) });
    const d = await r.json(); kanji = {}; for (const [k, v] of Object.entries(d)) if (v.jlpt_new) kanji[k] = v.jlpt_new;
    fs.mkdirSync("mochi", { recursive: true }); fs.writeFileSync(KJ, JSON.stringify(kanji)); console.log("한자 급수", Object.keys(kanji).length);
  } catch (e) { console.log("한자 급수 못 받음:", e.message); kanji = {}; }
}
const levelOf = w => { const ks = [...w].filter(c => HAS_KANJI.test(c)); if (!ks.length) return null; return Math.min(...ks.map(c => kanji[c] || 0)); };  // 0 = 급수 밖(어려움)

// ---- 낱말 사전: 뜻(한국어)·읽기·급수. 새 낱말만 번역 ----
const DJ = "mochi/dict.json", MAX_NEW_WORDS = 250;
const dict = fs.existsSync(DJ) ? JSON.parse(fs.readFileSync(DJ, "utf8")) : {};
const freq = new Map();
for (const p of posts) for (const l of p.lines) for (const t of l.t || []) if (t[2]) freq.set(t[2], (freq.get(t[2]) || 0) + 1);
const todo = [...freq.keys()].filter(b => !dict[b] || !dict[b].ko || dict[b].src !== "naver" && (dict[b].nv || 0) < 4).sort((a, b) => freq.get(b) - freq.get(a)).slice(0, MAX_NEW_WORDS);
console.log(`낱말 ${freq.size}개, 새로 뜻 찾을 낱말 ${todo.length}개`);
async function wordsT(words){
  try {
    const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=ko&dt=t`;
    const r = await fetch(u, { method: "POST", headers: { "User-Agent": H["User-Agent"], "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: "q=" + encodeURIComponent(words.join("\n")), signal: T(20000) });
    if (r.ok) { const j = await r.json(); const o = (j[0] || []).map(x => x[0]).join("").split("\n").map(x => x.trim()); if (o.length === words.length) return o; }
  } catch (e) {}
  const o = [];
  for (const w of words) { try { const r = await fetch(`https://api.mymemory.translated.net/get?langpair=ja|ko&de=mochi-bot@users.noreply.github.com&q=${encodeURIComponent(w)}`, { signal: T(15000) });
    const j = await r.json(); o.push(j.responseStatus == 200 ? j.responseData.translatedText : ""); } catch (e) { o.push(""); } await sleep(300); }
  return o;
}
// 네이버 일본어사전 (한국어 뜻이 가장 정확) → 안 되면 기계 번역
const strip = h => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
async function naver(w){
  try {
    const r = await fetch(`https://ja.dict.naver.com/api3/jako/search?query=${encodeURIComponent(w)}&m=pc&range=word&page=1`, { headers: { ...H, Referer: "https://ja.dict.naver.com/" }, signal: T(15000) });
    if (!r.ok) return { err: r.status };
    const j = await r.json(), items = j?.searchResultMap?.searchResultListMap?.WORD?.items || [];
    const keys = x => [strip(x.expEntry), strip(x.handleEntry), ...strip(x.expKanji).split(/[·・,、]/).map(k => k.replace(/[〈〉()（）]/g, "").trim())].filter(Boolean);
    const it = items.find(x => keys(x).includes(w)) || items.find(x => keys(x).some(k => k.replace(/[-・]/g, "") === w));
    if (!it) return { ko: "" };
    const means = (it.meansCollector || []).flatMap(m => (m.means || []).map(x => strip(x.value))).filter(Boolean);
    const clean = x => x.replace(/^\d+\.\s*/, "").replace(/\((?:=|→|←|↔)[^)]*\)/g, "").replace(/^\([^)]*\)\s*/, "").replace(/\s+/g, " ").replace(/[.。]\s*$/, "").trim();
    const ko = means.map(clean).filter(Boolean).slice(0, 2).join(" / ").slice(0, 60);
    const jl = +((String(it.frequencyAdd || "").match(/JLPT\s*(\d)/) || [])[1] || 0) || null;
    return { ko, jl };
  } catch (e) { return { err: e.message }; }
}
let nvOk = 0, nvFail = 0;
const left = [];
for (const b of todo) {
  const r = await naver(b);
  if (r.ko) { const toks = await an.parse(b); dict[b] = { r: HAS_KANJI.test(b) ? k2h(toks.map(t => t.reading || t.surface_form).join("")) : "", ko: r.ko, p: (toks[0] || {}).pos || "", lv: levelOf(b), jl: r.jl, src: "naver" }; nvOk++; }
  else { left.push(b); if (r.err) nvFail++; }
  if (nvFail >= 8 && !nvOk) { console.log("네이버 사전 연결 안 됨:", r.err); left.push(...todo.slice(todo.indexOf(b) + 1)); break; }
  await sleep(250);
}
for (const b of left) if (dict[b]) dict[b].nv = (dict[b].nv || 0) + 1;
console.log(`네이버 사전 뜻 ${nvOk}개, 남은 ${left.length}개`, Object.entries(dict).filter(([, v]) => v.src === "naver").slice(0, 6).map(([k, v]) => k + "=" + v.ko).join(" | "));
const rest = left.filter(b => !dict[b] || !dict[b].ko);
for (let i = 0; i < rest.length; i += 50) {
  const batch = rest.slice(i, i + 50), ko = await wordsT(batch);
  for (let j = 0; j < batch.length; j++) {
    const b = batch[j], toks = await an.parse(b);
    dict[b] = { r: HAS_KANJI.test(b) ? k2h(toks.map(t => t.reading || t.surface_form).join("")) : "", ko: (/^[\x00-\x7f]+$/.test(ko[j] || "") ? "" : (ko[j] || "").replace(/\(%\)|[（(][^)）]*[)）]|[.。]$/g, "").trim()), p: (toks[0] || {}).pos || "", lv: levelOf(b), src: "mt", nv: 1 };
  }
  await sleep(1500);
}
for (const [b, v] of Object.entries(dict)) if (v.lv === undefined) v.lv = levelOf(b);
fs.mkdirSync("mochi", { recursive: true }); fs.writeFileSync(DJ, JSON.stringify(dict));
console.log("사전 낱말", Object.keys(dict).length, "뜻 있는 낱말", Object.values(dict).filter(v => v.ko).length);

const out = { channelId, channelName, posts };
if (JSON.stringify({ ...out }) !== JSON.stringify({ ...old, updated: undefined })) {
  out.updated = new Date().toISOString(); fs.mkdirSync("mochi", { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n"); console.log("저장", posts.length);
}
