"""찬양기도회 영상의 곡(챕터)마다 템포(BPM)를 재서 worship/bpm.json 에 저장해요. (GitHub Actions에서 실행)
- worship/songs.json 의 최근 영상부터, 아직 안 잰 영상만 한 번에 몇 개씩
- 영상 소리만 받아서(yt-dlp) 곡마다 가운데 부분 약 70초로 템포를 재요(librosa)
"""
import json, os, re, subprocess, sys, tempfile
import numpy as np
import librosa

SONGS, OUT = "worship/songs.json", "worship/bpm.json"
PER_RUN = int(os.environ.get("BPM_PER_RUN", "1"))
SKIP = re.compile(r"^(말씀|밀씀|영상|광고|기도|헌금|축도|오프닝|인트로|엔딩|설교)$")

def norm(s):
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s.lower())
    return re.sub(r"[^0-9a-z가-힣]", "", s)

def skip(title):
    return bool(re.match(r"^\W*\(?\s*영상\s*\)", title)) or not norm(title) or bool(SKIP.match(norm(title)))

def tempo_of(y, sr):
    onset = librosa.onset.onset_strength(y=y, sr=sr, aggregate=np.median)
    # 찬양곡은 대부분 60~170 BPM. 120 근처를 살짝 선호하도록
    t = librosa.feature.tempo(onset_envelope=onset, sr=sr, start_bpm=100, aggregate=np.median)[0]
    while t < 58: t *= 2
    while t > 175: t /= 2
    # 박 위치가 얼마나 또렷한지(0~1): 낮으면 앱에서 '확인 필요'로 표시
    ac = librosa.autocorrelate(onset - onset.mean())
    lag = int(round(60 * sr / 512 / t))
    conf = float(max(0, ac[lag] / ac[0])) if 0 < lag < len(ac) and ac[0] > 0 else 0.0
    return round(float(t)), round(conf, 2)

songs = json.load(open(SONGS, encoding="utf-8"))
bpm = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
todo = [v for v in songs["videos"] if v["id"] not in bpm and v.get("chapters")][:PER_RUN]
print(f"템포 잴 영상 {len(todo)}개 (이미 잰 영상 {len(bpm)}개)")
failed = 0
for v in todo:
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "a.%(ext)s")
        # 유튜브가 서버를 '로봇'으로 의심하면 다른 방식(클라이언트)으로 차례로 시도
        for client in ["default", "tv", "web_safari", "mweb", "android_vr", "ios", "tv_embedded"]:
            args = ["yt-dlp", "-q", "--no-warnings", "-f", "bestaudio[abr<=96]/bestaudio/best", "-o", src]
            if client != "default": args += ["--extractor-args", f"youtube:player_client={client}"]
            r = subprocess.run(args + [f"https://www.youtube.com/watch?v={v['id']}"], capture_output=True, text=True)
            files = [f for f in os.listdir(d) if f.startswith("a.")]
            print(f"    {client}: {'성공' if files and not r.returncode else (r.stderr or '').strip()[:90]}")
            if files and not r.returncode: break
        if r.returncode or not files:
            print(f"  소리 받기 실패 {v['id']}: {(r.stderr or '').strip()[:200]}"); failed += 1; continue
        wav = os.path.join(d, "a.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-i", os.path.join(d, files[0]), "-ac", "1", "-ar", "22050", wav], check=True)
        dur = librosa.get_duration(path=wav)
        ch = v["chapters"]; res = {}
        for i, c in enumerate(ch):
            if skip(c["title"]): continue
            end = ch[i + 1]["t"] if i + 1 < len(ch) else dur
            length = end - c["t"]
            if length < 40: continue
            # 앞뒤 멘트·전주를 피해서 가운데 70초
            mid = c["t"] + max(10, (length - 70) / 2)
            y, sr = librosa.load(wav, sr=22050, offset=mid, duration=min(70, length - 10))
            t, conf = tempo_of(y, sr)
            res[str(c["t"])] = {"bpm": t, "conf": conf}
            print(f"  {v['date']} {c['title']}: {t} BPM (또렷함 {conf})")
        bpm[v["id"]] = res
os.makedirs("worship", exist_ok=True)
json.dump(bpm, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
if failed and failed == len(todo):
    print("이번엔 소리를 하나도 못 받았어요 (유튜브가 막았을 수 있어요)")
