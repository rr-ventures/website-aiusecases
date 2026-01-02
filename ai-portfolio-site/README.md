# AI Use-Case Portfolio (Static MVP)

A polished, zero-backend, static site that renders an **AI portfolio** from two JSON files:

- `ai-portfolio-site/data/big_wins.json` (Top 20 big wins)
- `ai-portfolio-site/data/daily_timeline.json` (daily timeline entries)

No build step. No React. Just vanilla HTML/CSS/JS.

## Run locally

Because the page loads JSON via `fetch()`, you must run a local server (opening `file://` will fail).

From the repo root:

```bash
python -m http.server 8000
```

Then open:

- `http://localhost:8000/ai-portfolio-site/`

Alternative (Node):

```bash
npx --yes serve .
```

## Replace the placeholder JSON with your real exports

Drop your real files here (same filenames):

- `ai-portfolio-site/data/big_wins.json`
- `ai-portfolio-site/data/daily_timeline.json`

### `big_wins.json` expected shape

Array of objects. Each win should include at least:

- `id` (string)
- `title` (string)
- `date_start` (`YYYY-MM-DD`) and optionally `date_end`
- `tags` (array of strings)
- `source_refs` (array of strings)
- `wow_score` (number 0–10)
- `problem` (string)
- `approach` (string or array)
- `evidence_snippets` (array of strings)
- `prompt_template` (string)
- `short_script` (string)
- `redactions_applied` (boolean)

### `daily_timeline.json` expected shape (both supported)

**Option A (array):**

```json
[
  {
    "date": "2025-01-02",
    "day_summary": "Shipped X",
    "items": ["Did A", "Did B"],
    "source_refs": ["ref1", "ref2"]
  }
]
```

**Option B (map keyed by date):**

```json
{
  "2025-01-02": {
    "day_summary": "Shipped X",
    "items": ["Did A", "Did B"],
    "source_refs": ["ref1"]
  }
}
```

## Deploy as a static site

Any static host works:

- **GitHub Pages**: commit this repo, enable Pages, point it at the branch/folder that contains `ai-portfolio-site/`.
- **Cloudflare Pages / Netlify**: set the “build command” to **none** and publish the directory containing `ai-portfolio-site/` (or the repo root).

## Notes

- No analytics, no trackers.
- The UI does **not** fabricate results—everything displayed comes from your JSON.
- Dark mode persists via `localStorage`.


