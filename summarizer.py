"""
summarizer.py

Extracts the main body text from a URL and summarizes it. Uses readability-lxml
to parse HTML into clean text, and OpenAI’s API to generate a concise summary.
Falls back to a naive summarizer (first few sentences) if the API key is missing
or the API call fails.

Dependencies:
    pip install readability-lxml requests beautifulsoup4 openai

Set your OpenAI API key in the environment variable OPENAI_API_KEY.
"""

from __future__ import annotations
import os
import re
import requests
from bs4 import BeautifulSoup
from readability import Document

try:
    import openai  # only needed if you want AI summaries
except ImportError:
    openai = None  # type: ignore


def _fetch_url(url: str, timeout: int = 10) -> bytes:
    """Fetch raw HTML content from a URL."""
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    return response.content


def extract_main_text(html: bytes) -> tuple[str, str]:
    """Return the title and cleaned body text from an HTML page."""
    doc = Document(html)
    title = doc.title() or "Untitled"
    summary_html = doc.summary()  # main article section
    soup = BeautifulSoup(summary_html, "html.parser")
    text = " ".join(soup.stripped_strings)
    return title, text


def naive_summary(text: str, max_sentences: int = 3) -> str:
    """Return the first N sentences of the text as a naive summary."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(sentences[:max_sentences])


def openai_summary(text: str, max_sentences: int = 3) -> str:
    """Summarize text using OpenAI’s API; requires openai and OPENAI_API_KEY."""
    if openai is None:
        raise RuntimeError("openai package not installed. Install via pip.")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    openai.api_key = api_key

    system_prompt = f"Summarize the following text in {max_sentences} sentences."
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        temperature=0.3,
        max_tokens=max_sentences * 50,
    )
    return response.choices[0].message.content.strip()


def summarise_url(url: str, max_sentences: int = 3) -> dict[str, str]:
    """Fetch a URL, extract its main text, and return a summary."""
    html = _fetch_url(url)
    title, body_text = extract_main_text(html)
    try:
        summary = openai_summary(body_text, max_sentences)
    except Exception:
        summary = naive_summary(body_text, max_sentences)
    return {
        "title": title,
        "text": body_text,
        "summary": summary,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Summarise a web page.")
    parser.add_argument("url", help="URL of the page to summarise")
    parser.add_argument(
        "-n",
        "--sentences",
        type=int,
        default=3,
        help="Number of sentences in the summary",
    )
    args = parser.parse_args()

    result = summarise_url(args.url, args.sentences)
    print(f"Title: {result['title']}\n")
    print("Summary:\n")
    print(result["summary"])
"""
summarizer.py

Extracts the main body text from a URL and summarizes it. Uses readability-lxml
to parse HTML into clean text, and OpenAI’s API to generate a concise summary.
Falls back to a naive summarizer (first few sentences) if the API key is missing
or the API call fails.

Dependencies:
    pip install readability-lxml requests beautifulsoup4 openai

Set your OpenAI API key in the environment variable OPENAI_API_KEY.
"""

from __future__ import annotations
import os
import re
import requests
from bs4 import BeautifulSoup
from readability import Document

try:
    import openai  # only needed if you want AI summaries
except ImportError:
    openai = None  # type: ignore


def _fetch_url(url: str, timeout: int = 10) -> bytes:
    """Fetch raw HTML content from a URL."""
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    return response.content


def extract_main_text(html: bytes) -> tuple[str, str]:
    """Return the title and cleaned body text from an HTML page."""
    doc = Document(html)
    title = doc.title() or "Untitled"
    summary_html = doc.summary()  # main article section
    soup = BeautifulSoup(summary_html, "html.parser")
    text = " ".join(soup.stripped_strings)
    return title, text


def naive_summary(text: str, max_sentences: int = 3) -> str:
    """Return the first N sentences of the text as a naive summary."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(sentences[:max_sentences])


def openai_summary(text: str, max_sentences: int = 3) -> str:
    """Summarize text using OpenAI’s API; requires openai and OPENAI_API_KEY."""
    if openai is None:
        raise RuntimeError("openai package not installed. Install via pip.")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    openai.api_key = api_key

    system_prompt = f"Summarize the following text in {max_sentences} sentences."
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        temperature=0.3,
        max_tokens=max_sentences * 50,
    )
    return response.choices[0].message.content.strip()


def summarise_url(url: str, max_sentences: int = 3) -> dict[str, str]:
    """Fetch a URL, extract its main text, and return a summary."""
    html = _fetch_url(url)
    title, body_text = extract_main_text(html)
    try:
        summary = openai_summary(body_text, max_sentences)
    except Exception:
        summary = naive_summary(body_text, max_sentences)
    return {
        "title": title,
        "text": body_text,
        "summary": summary,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Summarise a web page.")
    parser.add_argument("url", help="URL of the page to summarise")
    parser.add_argument(
        "-n",
        "--sentences",
        type=int,
        default=3,
        help="Number of sentences in the summary",
    )
    args = parser.parse_args()

    result = summarise_url(args.url, args.sentences)
    print(f"Title: {result['title']}\n")
    print("Summary:\n")
    print(result["summary"])





