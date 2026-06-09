# Kiwul Content Studio

Local-first AI content production studio for short-form vertical video (TikTok / Reels / YouTube Shorts). Runs entirely on your Windows machine with local AI providers — no cloud, no API keys, no mock data.

## Pipeline

Brief → Ideas → Storyline → Script → Storyboard → Characters → Locations → Image Prompts → Motion Prompts → Scene Images → Scene Videos → Scene Audio → Final Render

## Prerequisites (Windows)

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20+ | https://nodejs.org |
| **Ollama** | latest | https://ollama.com/download → `ollama pull qwen3:8b` |
| **Z-Image Turbo** | any | Run on `http://127.0.0.1:9100/v1` (ComfyUI + Z-Image node) |
| **LTX-Video (ComfyUI)** | any | Run on `http://127.0.0.1:9200/v1` (ComfyUI + LTX-V node) |
| **Edge-TTS** | latest | `pip install edge-tts` |
| **FFmpeg** | 6+ | https://ffmpeg.org/download.html → add to PATH |
| **Python** | 3.10+ | (needed by edge-tts) |

> RTX 2000 Ada 16 GB VRAM recommended. Image gen: ~3–5 s. Video gen: ~60–90 s per 3-s scene.

## Quick Start

```powershell
# 1. Clone
git clone https://github.com/kent1715/kiwul-z.git
cd kiwul-z

# 2. Install dependencies
npm install

# 3. Configure environment
copy .env.example .env
# Edit .env if your provider URLs/ports differ

# 4. Set up database
npx prisma generate
npx prisma db push

# 5. Start dev server
npm run dev
# → Open http://localhost:3000

# 6. Seed default providers & prompt templates
#    (PowerShell)
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/seed

# 7. Test all providers
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/providers/test-all
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite database path |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` | Ollama API endpoint |
| `OLLAMA_MODEL` | `qwen3:8b` | Ollama model name |
| `ZIMAGE_BASE_URL` | `http://127.0.0.1:9100/v1` | Z-Image API endpoint |
| `ZIMAGE_MODEL` | `z-image-turbo` | Image model name |
| `LTX_BASE_URL` | `http://127.0.0.1:9200/v1` | LTX-Video API endpoint |
| `LTX_MODEL` | `comfy-ltxv-i2v` | Video model name |
| `EDGE_TTS_VOICE` | `id-ID-ArdiNeural` | Edge-TTS voice |
| `OUTPUT_DIR` | `outputs/projects` | Base output directory |

## Workflow

1. **Create Project** — Set title, content type, language, duration, visual style
2. **Generate Ideas** — LLM generates 3 creative ideas; select one
3. **Generate Storyline** — LLM builds narrative arc from selected idea
4. **Generate Script** — LLM writes scene-by-scene script with VO text
5. **Generate Storyboard** — LLM creates detailed storyboard with timing
6. **Generate Characters** — LLM designs characters with visual consistency prompts
7. **Generate Locations** — LLM defines locations with visual style
8. **Generate Images** — Z-Image renders scene images from prompts
9. **Generate Videos** — LTX-Video creates image-to-video clips
10. **Generate Voice** — Edge-TTS synthesizes voice-over audio
11. **Render Final** — FFmpeg merges video + audio, concatenates, burns subtitles

Each step can be re-run individually. Failed scenes can be regenerated without restarting the project.

## API Endpoints

### Providers
- `GET /api/providers` — List all providers
- `POST /api/providers` — Create provider
- `PATCH /api/providers` — Update provider
- `POST /api/providers/test` — Test single provider (`{ "type": "llm" }`)
- `POST /api/providers/test-all` — Test all providers

### Projects
- `POST /api/projects` — Create project
- `GET /api/projects` — List projects
- `GET /api/projects/[id]` — Get project details

### Generation
- `POST /api/ideas/generate` — Generate ideas
- `POST /api/ideas/[id]/select` — Select idea
- `POST /api/storyline/generate` — Generate storyline
- `POST /api/script/generate` — Generate script
- `POST /api/storyboard/generate` — Generate storyboard
- `POST /api/characters/generate` — Generate characters
- `POST /api/locations/generate` — Generate locations
- `POST /api/images/generate` — Generate scene images
- `POST /api/videos/generate` — Generate scene videos
- `POST /api/voice/generate` — Generate voice-over
- `POST /api/render` — Render final video
- `POST /api/projects/[id]/qc` — Quality check

### Assets
- `GET /api/assets/[...path]` — Serve output files
- `POST /api/seed` — Seed default providers & templates

## Project Output Structure

```
outputs/projects/{project_id}/
├── characters/       # Character reference images
├── locations/        # Location reference images
├── images/           # Scene images (PNG)
├── videos/           # Scene videos (MP4)
├── audio/            # Scene voice-over (WAV)
├── subtitles/        # SRT subtitle files
├── final/            # Final rendered video
└── logs/             # Generation logs
```

## Troubleshooting

### Ollama not found
```powershell
# Make sure Ollama is running
ollama serve
# In another terminal:
ollama pull qwen3:8b
```

### Edge-TTS not found
```powershell
pip install edge-tts
# Verify:
edge-tts --list-voices
```

### FFmpeg not found
```powershell
# Download from https://ffmpeg.org/download.html
# Add to system PATH
ffmpeg -version
```

### Port already in use
```powershell
# Find process on port 3000
netstat -ano | findstr :3000
# Kill it
taskkill /PID <PID> /F
```

## License

Private — All rights reserved.
