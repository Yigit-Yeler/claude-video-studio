"""Müzik ritim analizi (yalnızca numpy). Kullanım:
python beats.py <ham_f32le.raw> <çıktı.json> --sr 22050 [--max 20] [--min 12] [--duration-hint sn]

Çıktı (saniye cinsinden, seçilen bölümün başına göre):
  bpm, beatInterval, segment {start,end,duration} (orijinal müzikte),
  beats[], downbeats[] (ölçü başları), hits[] (en güçlü vurgular, güce göre), energy[] (vuruş başına 0-1)
"""

import argparse
import json
import sys

import numpy as np


def stft_mag(y, n_fft=2048, hop=512):
    window = np.hanning(n_fft).astype(np.float32)
    if len(y) < n_fft:
        y = np.pad(y, (0, n_fft - len(y)))
    frames = 1 + (len(y) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(frames)[:, None]
    return np.abs(np.fft.rfft(y[idx] * window, axis=1)).astype(np.float32)


def onset_envelope(mag, sr, n_fft, lo=None, hi=None):
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    band = np.ones_like(freqs, dtype=bool)
    if lo is not None:
        band &= freqs >= lo
    if hi is not None:
        band &= freqs <= hi
    s = np.log1p(1000.0 * mag[:, band])
    flux = np.maximum(0.0, np.diff(s, axis=0)).sum(axis=1)
    flux = np.concatenate([[0.0], flux])
    flux -= np.convolve(flux, np.ones(16) / 16, mode="same")  # yerel ortalamayı çıkar
    flux = np.maximum(flux, 0.0)
    peak = flux.max() or 1.0
    return flux / peak


def estimate_period(env, fps, lo_bpm=70, hi_bpm=180):
    env = env - env.mean()
    ac = np.correlate(env, env, mode="full")[len(env) - 1 :]
    lags = np.arange(len(ac))
    bpm = np.where(lags > 0, 60.0 * fps / np.maximum(lags, 1), 0)
    valid = (bpm >= lo_bpm) & (bpm <= hi_bpm)
    weight = np.exp(-0.5 * (np.log2(np.maximum(bpm, 1e-6) / 120.0) / 0.9) ** 2)
    score = np.where(valid, ac * weight, -np.inf)
    lag = int(np.argmax(score))
    # parabolik iyileştirme
    if 1 <= lag < len(ac) - 1:
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        denom = a - 2 * b + c
        shift = 0.5 * (a - c) / denom if denom != 0 else 0.0
        return lag + float(np.clip(shift, -0.5, 0.5))
    return float(lag)


def track_beats(env, period, tightness=100.0):
    n = len(env)
    score = env.astype(np.float64).copy()
    back = -np.ones(n, dtype=int)
    lo, hi = int(round(period / 2)), int(round(period * 2))
    for t in range(n):
        start, end = t - hi, t - lo
        if end <= 0:
            continue
        prev = np.arange(max(0, start), end)
        penalty = -tightness * (np.log((t - prev) / period)) ** 2
        cand = score[prev] + penalty
        k = int(np.argmax(cand))
        if cand[k] > 0:
            score[t] = env[t] + cand[k]
            back[t] = prev[k]
    # son vuruşu, son periyot içindeki en yüksek skordan seç
    tail = max(0, n - int(round(period)) - 1)
    t = tail + int(np.argmax(score[tail:]))
    beats = []
    while t >= 0:
        beats.append(t)
        t = back[t]
    return np.array(beats[::-1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("raw")
    parser.add_argument("output")
    parser.add_argument("--sr", type=int, default=22050)
    parser.add_argument("--max", type=float, default=20.0)
    parser.add_argument("--min", type=float, default=12.0)
    args = parser.parse_args()

    y = np.fromfile(args.raw, dtype=np.float32)
    sr = args.sr
    duration = len(y) / sr
    if duration < 1.0:
        raise SystemExit("Müzik çok kısa.")
    n_fft, hop = 2048, 512
    fps = sr / hop
    mag = stft_mag(y, n_fft, hop)
    env = onset_envelope(mag, sr, n_fft)
    low = onset_envelope(mag, sr, n_fft, lo=30, hi=180)  # davul/bas vurguları
    combined = 0.6 * env + 0.4 * low

    period = estimate_period(combined, fps)
    beat_frames = track_beats(combined, period)

    beat_times = beat_frames / fps
    bpm = 60.0 * fps / period

    # ölçü başı: 4 fazdan bas vurgusu en güçlü olanı
    phase_scores = [low[beat_frames[p::4]].sum() if len(beat_frames[p::4]) else 0 for p in range(4)]
    phase = int(np.argmax(phase_scores))
    downbeat_times = beat_times[phase::4]

    # vuruş başına enerji (RMS)
    rms = np.sqrt(np.convolve(y.astype(np.float64) ** 2, np.ones(hop) / hop, mode="same"))[::hop][: len(env)]
    energy = np.array([rms[max(0, f - 4) : f + 5].mean() for f in beat_frames]) if len(beat_frames) else np.array([])
    if energy.size:
        energy = energy / (energy.max() or 1.0)

    # bölüm seçimi
    if duration <= args.max + 0.3:
        seg_start, seg_end = 0.0, duration
    else:
        bar = 4 * period / fps
        bars = max(1, int(np.floor(args.max / bar)))
        while bars > 1 and bars * bar > args.max:
            bars -= 1
        length = bars * bar if bars * bar >= args.min else min(args.max, duration)
        best, best_score = 0.0, -1.0
        starts = downbeat_times if len(downbeat_times) else beat_times
        for s in starts:
            e = s + length
            if e > duration - 0.05:
                break
            mask = (beat_times >= s) & (beat_times < e)
            if not mask.any():
                continue
            seg_energy = energy[mask].mean()
            seg_onset = combined[(beat_frames[mask])].mean()
            # yükselişle başlamayan, sessiz girişli bölümleri cezalandır
            first = energy[mask][: max(1, int(mask.sum() * 0.15))].mean()
            sc = seg_energy + 0.5 * seg_onset + 0.3 * first
            if sc > best_score:
                best, best_score = float(s), float(sc)
        seg_start, seg_end = best, best + length

    # Bölüme özel faz düzeltmesi: seçilen bölümde vuruş ızgarası bas/davul vurgularına en iyi oturacak şekilde
    # (en fazla yarım vuruş) kaydırılır. Şarkının farklı bölümlerinde faz değişebildiği için bölüm bazında yapılır.
    ref = low if low.max() > 0 and low[int(seg_start * fps) : int(seg_end * fps)].mean() > 0.02 else combined
    seg_mask = (beat_times >= seg_start - period / fps) & (beat_times < seg_end + period / fps)
    seg_frames = beat_frames[seg_mask]

    def strength(frames):
        frames = frames[(frames >= 1) & (frames < len(ref) - 2)]
        return float(np.mean([ref[f - 1 : f + 2].max() for f in frames])) if len(frames) else 0.0

    if len(seg_frames) >= 4:
        base = strength(seg_frames)
        best_shift, best_val = 0, base
        for k in range(-8, 9):
            shift = int(round(k * period / 16))
            val = strength(seg_frames + shift)
            if val > best_val:
                best_shift, best_val = shift, val
        if best_shift != 0 and best_val > base * 1.2 and best_val - base > 0.03:
            beat_frames = np.where(seg_mask, beat_frames + best_shift, beat_frames)
            beat_times = beat_frames / fps
            seg_frames = beat_frames[seg_mask]
    # ölçü başlarını bölüm içinde yeniden belirle
    in_seg_frames = beat_frames[(beat_times >= seg_start - 1e-3) & (beat_times < seg_end - 1e-3)]
    if len(in_seg_frames):
        phase_scores = [ref[in_seg_frames[p::4]].sum() if len(in_seg_frames[p::4]) else 0 for p in range(4)]
        downbeat_times = in_seg_frames[int(np.argmax(phase_scores))::4] / fps
        energy = np.array([rms[max(0, f - 4) : f + 5].mean() for f in beat_frames])
        energy = energy / (energy.max() or 1.0)

    rel = lambda arr: [round(float(t - seg_start), 3) for t in arr if seg_start - 1e-3 <= t < seg_end - 1e-3]
    in_seg = (beat_times >= seg_start - 1e-3) & (beat_times < seg_end - 1e-3)

    # en güçlü vurgular: onset zirveleri
    peaks = [
        i for i in range(1, len(combined) - 1)
        if combined[i] >= combined[i - 1] and combined[i] > combined[i + 1] and combined[i] > combined.mean() + 1.5 * combined.std()
    ]
    peaks.sort(key=lambda i: -combined[i])
    chosen = []
    for i in peaks:
        t = i / fps
        if not (seg_start <= t < seg_end):
            continue
        if all(abs(t - c) >= 0.25 for c in chosen):
            chosen.append(t)
        if len(chosen) >= 24:
            break
    hits = [{"t": round(t - seg_start, 3), "strength": round(float(combined[int(round(t * fps))]), 2)} for t in sorted(chosen)]

    result = {
        "bpm": round(float(bpm), 1),
        "beatInterval": round(float(period / fps), 4),
        "musicDuration": round(duration, 3),
        "segment": {"start": round(seg_start, 3), "end": round(seg_end, 3), "duration": round(seg_end - seg_start, 3)},
        "beats": rel(beat_times),
        "downbeats": rel(downbeat_times),
        "hits": hits,
        "energy": [round(float(e), 2) for e in energy[in_seg]],
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write(
        f"{args.output}\nbpm={result['bpm']} vuruş aralığı={result['beatInterval']} sn, "
        f"bölüm {result['segment']['start']}–{result['segment']['end']} sn ({result['segment']['duration']} sn), "
        f"{len(result['beats'])} vuruş, {len(result['downbeats'])} ölçü başı, {len(hits)} güçlü vurgu\n"
    )


if __name__ == "__main__":
    main()
