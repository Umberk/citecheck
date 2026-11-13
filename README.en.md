# CiteCheck

[中文](README.md) | English

Upload one or more paper PDFs and ask a question. CiteCheck returns an answer, the supporting passages, and a section and page for each sentence. A sentence that the retrieved text does not support is marked uncertain and left out of the final answer.

Papers are split into section-aware chunks that keep page numbers. A factual question is retrieved once. A question that connects different sections is split into sub-questions first. BM25 and embedding rankings are merged. Before the answer is returned, the model checks each sentence against the retrieved passages. That decision does not use the retrieval score.

## Setup

Python 3.12 is required.

```bash
uv venv .venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env
```

Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` in `.env`. The client speaks the OpenAI chat API. The sample configuration uses DeepSeek. Keep the API key in the local `.env` file.

```bash
python -m citecheck
```

This checks that the settings were read. It does not print the key or call the model. The first retrieval downloads the `all-MiniLM-L6-v2` embedding model.

## Use

Create the sample papers and ask a question:

```bash
python -m citecheck.sample_docs
python -m citecheck.ask \
  --pdf examples/widgetnet.pdf \
  --question "What accuracy does WidgetNet reach on Widget-100?"
```

Ask about two papers:

```bash
python -m citecheck.ask \
  --pdf examples/widgetnet.pdf \
  --pdf examples/widgetnet_lite.pdf \
  --question "Do WidgetNet and WidgetNet-Lite report the same accuracy on Widget-100?"
```

`--system` accepts `b1`, `b2`, `b3`, `full`, `no_planner`, `embedding_only`, and `no_verifier`.

Web workspace:

```bash
cd frontend && npm install && npm run build && cd ..
python -m citecheck.web
```

Open http://127.0.0.1:8000 . It redirects to `/app`. Register, upload a PDF or import the sample papers, ask in the AI Reader, and click a citation to jump back into the PDF. `/legacy` is the original single-page demo. The header switches between Chinese and English.

PDFs are stored under `data/` unless Tencent Cloud COS is configured with `COS_SECRET_ID`, `COS_SECRET_KEY`, `COS_BUCKET`, and `COS_REGION`. Keys stay on the server. Uploads default to 20MB, and one PDF is parsed at a time. See [docs/DEPLOY.md](docs/DEPLOY.md) for the server and [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the demo order.

## Comparisons

- B1: prompt the model with the question and no paper.
- B2: one hybrid retrieval, then an answer, with no planner and no sentence check.
- B3: plan the retrieval, with no sentence check.
- CiteCheck: B3 followed by a sentence check. Supported sentences keep their citations. The others are marked uncertain.

## Evaluation

```bash
python -m citecheck.evaluate --dataset custom --systems b1,b2,b3,full
python -m citecheck.evaluate --dataset qasper --limit 20 --systems b1,b2,b3,full
python -m citecheck.evaluate --dataset scifact --limit 50
python -m unittest discover -s tests -v
```

Results are written to `data/results/latest.json`. QASPER and SciFact are downloaded into `data/`, which is not committed. QASPER is scored with token F1 and evidence recall, not page citations. SciFact scores whether an abstract supports or refutes a claim. Custom questions live in `examples/custom_questions.json`. A citation is correct only when both the section and the page match. The sample papers are synthetic and can be replaced with the same question format.
