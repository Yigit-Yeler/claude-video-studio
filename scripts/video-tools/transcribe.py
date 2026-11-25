"""Kelime zamanlı transkript. Kullanım: python transcribe.py <ses.wav> <çıktı.json> [--language tr] [--model large-v3-turbo]"""

import argparse
import json
import sys

from faster_whisper import WhisperModel


def load_model(name: str) -> WhisperModel:
    try:
        return WhisperModel(name, device="cuda", compute_type="float16")
    except Exception:
        return WhisperModel(name, device="cpu", compute_type="int8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("output")
    parser.add_argument("--language", default=None)
    parser.add_argument("--model", default="large-v3-turbo")
    args = parser.parse_args()

    model = load_model(args.model)
    try:
        segments, info = model.transcribe(
            args.audio,
            language=args.language,
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
        )
        segments = list(segments)
    except RuntimeError:
        # CUDA kütüphaneleri eksikse model yüklenir ama ilk çözümde patlar.
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            args.audio,
            language=args.language,
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
        )
        segments = list(segments)

    words = []
    out_segments = []
    for segment in segments:
        seg_words = [
            {
                "word": w.word.strip(),
                "start": round(w.start, 3),
                "end": round(w.end, 3),
                "probability": round(w.probability, 3),
            }
            for w in (segment.words or [])
            if w.word.strip()
        ]
        words.extend(seg_words)
        out_segments.append(
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
                "words": seg_words,
            }
        )

    result = {
        "language": info.language,
        "languageProbability": round(info.language_probability, 3),
        "duration": round(info.duration, 3),
        "text": " ".join(s["text"] for s in out_segments),
        # Kelimeler yalnızca burada (segmentlerde tekrar edilmez); segmentler "words" yerine
        # kelime dizinlerini [ilk, son] verir. Böylece dosya ajanın bağlamında çok daha az yer tutar.
        "segments": [],
        "words": words,
    }
    index = 0
    for segment in out_segments:
        count = len(segment["words"])
        result["segments"].append(
            {
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"],
                "wordRange": [index, index + count - 1] if count else None,
            }
        )
        index += count

    # Okunabilir ama sıkı biçim: her segment ve her kelime tek satır.
    lines = ["{"]
    for key in ("language", "languageProbability", "duration", "text"):
        lines.append(f"  {json.dumps(key)}: {json.dumps(result[key], ensure_ascii=False)},")
    lines.append('  "segments": [')
    lines.append(",\n".join("    " + json.dumps(seg, ensure_ascii=False, separators=(",", ":")) for seg in result["segments"]))
    lines.append("  ],")
    lines.append('  "words": [')
    lines.append(",\n".join("    " + json.dumps(w, ensure_ascii=False, separators=(",", ":")) for w in words))
    lines.append("  ]")
    lines.append("}")
    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    sys.stdout.write(
        f"{args.output}\n{len(words)} kelime, dil={info.language}\n"
        "Biçim: words = [{word,start,end,probability}] (saniye); segments = [{start,end,text,wordRange:[ilk,son]}]\n"
        f"{result['text']}\n"
    )


if __name__ == "__main__":
    main()
