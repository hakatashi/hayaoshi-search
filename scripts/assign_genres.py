#!/usr/bin/env python3
"""
Automatically assign genres to hayaoshi quiz questions using a local LLM.

Uses the Qwen3.5-35B-A3B instruction model via llama-server (ROCm/AMD GPU).
The model is downloaded automatically from HuggingFace on first run.

Usage:
    python assign_genres.py [--dry-run] [--limit N] [--batch-size N] [--seed N]

Options:
    --dry-run       Preview predictions without writing to Firestore
    --limit N       Process at most N questions (default: all)
    --batch-size N  Print progress every N questions (default: 10)
    --seed N        Random seed for few-shot example selection (default: 0)
"""

import argparse
import json
import os
import random
import re
import signal
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from huggingface_hub import hf_hub_download
import requests

# ─────────────────────────────────────────────
# Paths & constants
# ─────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
GENRES_FILE = PROJECT_DIR / "genres.json"
ADMIN_KEY_FILE = PROJECT_DIR / "hayaoshi-search-firebase-adminsdk-fbsvc-03cdc81e23.json"

LLAMA_SERVER_BINARY = Path.home() / "Documents/GitHub/llama.cpp/build/bin/llama-server"

HF_REPO_ID = "unsloth/Qwen3.5-35B-A3B-GGUF"
HF_FILENAME = "Qwen3.5-35B-A3B-Q6_K.gguf"

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8081
SERVER_URL = f"http://{SERVER_HOST}:{SERVER_PORT}"

# Number of few-shot conversation turns per major category
EXAMPLES_PER_MAJOR = 1
# Maximum total few-shot turns (to keep prompt within context limits)
MAX_FEW_SHOT = 20

# ─────────────────────────────────────────────
# Model download
# ─────────────────────────────────────────────

def download_model() -> str:
    """
    Download the GGUF model from HuggingFace (cached after first run).
    Returns the local file path.
    """
    print(f"Downloading model {HF_REPO_ID} / {HF_FILENAME} …")
    path = hf_hub_download(
        repo_id=HF_REPO_ID,
        filename=HF_FILENAME,
        resume_download=True,
    )
    print(f"  Model path: {path}")
    return path


# ─────────────────────────────────────────────
# Genre helpers
# ─────────────────────────────────────────────

def load_genres() -> dict:
    with open(GENRES_FILE, encoding="utf-8") as f:
        return json.load(f)


def build_genre_list_text(genres: dict) -> str:
    """Return a compact list of 'major - minor' genre strings."""
    lines = []
    for major, minors in genres.items():
        for minor, desc in minors.items():
            lines.append(f"  {major} - {minor}：{desc}")
    return "\n".join(lines)


def is_valid_genre(genres: dict, major: str, minor: str) -> bool:
    return major in genres and minor in genres[major]


def normalize_genre(text: str) -> str:
    """Strip surrounding whitespace and common noise from LLM output."""
    return text.strip().strip("「」『』【】 　")


def parse_genre_response(text: str) -> tuple[str, str] | None:
    """
    Parse LLM output of the form:
        大ジャンル: XXX
        小ジャンル: YYY
    Also strips any <think>...</think> block Qwen3 may emit.
    Returns (major, minor) or None if parsing fails.
    """
    # Strip thinking block if present
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    major_m = re.search(r"大ジャンル[:：]\s*(.+)", cleaned)
    minor_m = re.search(r"小ジャンル[:：]\s*(.+)", cleaned)

    if not major_m or not minor_m:
        return None

    major = normalize_genre(major_m.group(1).split("\n")[0])
    minor = normalize_genre(minor_m.group(1).split("\n")[0])
    return major, minor


# ─────────────────────────────────────────────
# llama-server management
# ─────────────────────────────────────────────

def start_llama_server(model_path: str) -> subprocess.Popen:
    if not LLAMA_SERVER_BINARY.exists():
        raise FileNotFoundError(f"llama-server not found: {LLAMA_SERVER_BINARY}")

    cmd = [
        str(LLAMA_SERVER_BINARY),
        "-m", model_path,
        "--host", SERVER_HOST,
        "--port", str(SERVER_PORT),
        "-c", "8192",
        "-ngl", "-1",   # All layers on GPU (ROCm)
    ]
    print(f"Starting llama-server …\n  {' '.join(cmd)}")
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    return process


def wait_for_server(url: str, timeout: int = 600) -> None:
    """Poll /health until the server reports 'ok' (model fully loaded)."""
    print("Waiting for llama-server to become ready …")
    time.sleep(5)
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = requests.get(f"{url}/health", timeout=5)
            if resp.status_code == 200:
                status = resp.json().get("status", "")
                print(f"  server status: {status}")
                if status == "ok":
                    print("llama-server is ready.")
                    return
                # "loading model" → keep waiting
            elif resp.status_code == 503:
                print("  server status: loading (503) …")
        except Exception as exc:
            print(f"  not yet reachable: {exc}")
        time.sleep(5)
    raise RuntimeError("llama-server failed to start within timeout")


def stop_server(process: subprocess.Popen) -> None:
    try:
        os.killpg(os.getpgid(process.pid), signal.SIGTERM)
    except (ProcessLookupError, OSError):
        pass
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    print("llama-server stopped.")


# ─────────────────────────────────────────────
# Prompt / chat construction
# ─────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = """\
あなたは早押しクイズの問題文と答えを受け取り、適切な大ジャンルと小ジャンルを分類するアシスタントです。

【ルール】
- 必ず下記の「利用可能なジャンル一覧」に存在する大ジャンルと小ジャンルのみを出力してください。
- 出力は必ず以下の形式で行ってください（他の文章を含めないこと）:
  大ジャンル: （大ジャンル名）
  小ジャンル: （小ジャンル名）

【利用可能なジャンル一覧】
{genre_list}
"""

USER_TEMPLATE = """\
以下の早押しクイズ問題のジャンルを分類してください。

問題文: {question}
答え: {answer}\
"""

ASSISTANT_TEMPLATE = """\
大ジャンル: {major}
小ジャンル: {minor}\
"""


def build_messages(
    genre_list_text: str,
    few_shot_examples: list[dict],
    target: dict,
) -> list[dict]:
    """
    Build the messages list for /v1/chat/completions.

    Structure:
      system  → instructions + genre list
      user    → few-shot example question 1
      assistant → few-shot answer 1
      ...
      user    → target question
    """
    system_content = SYSTEM_PROMPT_TEMPLATE.format(genre_list=genre_list_text)
    messages: list[dict] = [{"role": "system", "content": system_content}]

    for ex in few_shot_examples:
        messages.append({
            "role": "user",
            "content": USER_TEMPLATE.format(
                question=ex["question"],
                answer=ex["answer"],
            ),
        })
        messages.append({
            "role": "assistant",
            "content": ASSISTANT_TEMPLATE.format(
                major=ex["majorCategory"],
                minor=ex["minorCategory"],
            ),
        })

    messages.append({
        "role": "user",
        "content": USER_TEMPLATE.format(
            question=target["question"],
            answer=target["answer"],
        ),
    })

    return messages


def chat_complete(server_url: str, messages: list[dict]) -> str:
    """Call /v1/chat/completions and return the assistant's reply text."""
    response = requests.post(
        f"{server_url}/v1/chat/completions",
        json={
            "model": "local",
            "messages": messages,
            "max_tokens": 60,
            "temperature": 0.05,
            "top_p": 0.9,
            "top_k": 10,
            "repeat_penalty": 1.1,
            "seed": 42,
            # Ask the model not to use the thinking chain (Qwen3 feature)
            "chat_template_kwargs": {"enable_thinking": False},
        },
        timeout=180,
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"llama-server /v1/chat/completions returned "
            f"{response.status_code}: {response.text}"
        )
    return response.json()["choices"][0]["message"]["content"]


def generate_genres(
    server_url: str,
    genre_list_text: str,
    few_shot_examples: list[dict],
    target: dict,
) -> tuple[str, str]:
    """
    Send a chat request and parse the major/minor genre from the response.
    Raises ValueError if the response cannot be parsed.
    """
    messages = build_messages(genre_list_text, few_shot_examples, target)
    raw_reply = chat_complete(server_url, messages)
    print(f"  raw reply: {raw_reply!r}")

    result = parse_genre_response(raw_reply)
    if result is None:
        raise ValueError(f"Could not parse genre from reply: {raw_reply!r}")

    return result


# ─────────────────────────────────────────────
# Few-shot example selection
# ─────────────────────────────────────────────

def get_balanced_examples(
    classified: list[dict],
    genres: dict,
    per_major: int = EXAMPLES_PER_MAJOR,
    max_total: int = MAX_FEW_SHOT,
) -> list[dict]:
    """
    Pick `per_major` examples from each major category for balanced few-shot coverage.
    Iterates in genres.json order for determinism, then shuffles.
    """
    by_major: dict[str, list[dict]] = defaultdict(list)
    for q in classified:
        major = q.get("majorCategory", "")
        if major and major in genres:
            by_major[major].append(q)

    examples: list[dict] = []
    for major in genres:
        bucket = by_major.get(major, [])
        if bucket:
            selected = random.sample(bucket, min(per_major, len(bucket)))
            examples.extend(selected)

    random.shuffle(examples)
    return examples[:max_total]


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Do not write to Firestore")
    parser.add_argument("--limit", type=int, default=None, help="Max questions to process")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Print progress every N questions (default: 10)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=0,
        help="Random seed for few-shot example selection (default: 0)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    random.seed(args.seed)

    # ── Load genres ──────────────────────────────────────────────────────────
    genres = load_genres()
    genre_list_text = build_genre_list_text(genres)
    total_genres = sum(len(v) for v in genres.values())
    print(f"Loaded {total_genres} genre entries across {len(genres)} major categories.")

    # ── Download model ────────────────────────────────────────────────────────
    model_path = download_model()

    # ── Firebase init ─────────────────────────────────────────────────────────
    cred = credentials.Certificate(str(ADMIN_KEY_FILE))
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    # ── Fetch questions ───────────────────────────────────────────────────────
    print("Fetching questions from Firestore …")
    questions_ref = db.collection("questions")
    all_docs = list(questions_ref.stream())
    print(f"  Total documents fetched: {len(all_docs)}")

    classified: list[dict] = []
    unclassified: list[dict] = []

    for snap in all_docs:
        data = snap.to_dict()
        data["id"] = snap.id
        major = (data.get("majorCategory") or "").strip()
        minor = (data.get("minorCategory") or "").strip()
        ai_estimated = data.get("aiGenreEstimated", False)

        if major and minor and not ai_estimated:
            # Human-labelled: valid for few-shot source
            if is_valid_genre(genres, major, minor):
                classified.append(data)
        elif not major or not minor:
            # No genre assigned yet
            unclassified.append(data)
        # aiGenreEstimated=True with both fields set → already done, skip

    print(f"  Human-classified: {len(classified)}")
    print(f"  Unclassified:     {len(unclassified)}")

    if not unclassified:
        print("No unclassified questions found. Nothing to do.")
        return

    if args.limit:
        unclassified = unclassified[: args.limit]
        print(f"  (Limited to first {args.limit} questions.)")

    # ── Select few-shot examples ──────────────────────────────────────────────
    few_shot = get_balanced_examples(classified, genres)
    print(f"Using {len(few_shot)} few-shot examples (up to 1 per major category).")
    if not few_shot:
        print(
            "WARNING: No human-classified questions found. "
            "The LLM will operate without few-shot examples."
        )

    # ── Start llama-server ────────────────────────────────────────────────────
    server_process = start_llama_server(model_path)

    import atexit
    atexit.register(stop_server, server_process)

    try:
        wait_for_server(SERVER_URL)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        stop_server(server_process)
        sys.exit(1)

    # ── Process questions ─────────────────────────────────────────────────────
    success = 0
    skipped = 0
    errors = 0

    for idx, question in enumerate(unclassified, start=1):
        qid = question["id"]
        q_text = question.get("question") or ""
        print(f"\n[{idx}/{len(unclassified)}] {qid}")
        print(f"  問題: {q_text}")
        print(f"  答え: {question.get('answer', '')}")

        try:
            major, minor = generate_genres(SERVER_URL, genre_list_text, few_shot, question)
        except Exception as exc:
            print(f"  ERROR during generation: {exc}")
            errors += 1
            continue

        print(f"  → 大ジャンル: {major!r}")
        print(f"  → 小ジャンル: {minor!r}")

        if not is_valid_genre(genres, major, minor):
            print(f"  INVALID: '{major} - {minor}' is not in genres.json. Skipping.")
            skipped += 1
            continue

        if args.dry_run:
            print("  [dry-run] Would update Firestore.")
        else:
            questions_ref.document(qid).update({
                "majorCategory": major,
                "minorCategory": minor,
                "aiGenreEstimated": True,
            })
            print(f"  Saved: {major} - {minor}")

        success += 1

        if idx % args.batch_size == 0:
            print(
                f"\n--- Progress: {idx}/{len(unclassified)} processed, "
                f"{success} saved, {skipped} skipped, {errors} errors ---"
            )

    # ── Summary ───────────────────────────────────────────────────────────────
    print(
        f"\n{'='*60}\n"
        f"Done.\n"
        f"  Processed : {len(unclassified)}\n"
        f"  Saved     : {success}{'  (dry-run, not written)' if args.dry_run else ''}\n"
        f"  Skipped   : {skipped}  (invalid genre output)\n"
        f"  Errors    : {errors}\n"
        f"{'='*60}"
    )


if __name__ == "__main__":
    main()
