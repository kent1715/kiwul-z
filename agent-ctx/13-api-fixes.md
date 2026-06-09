# Task 13 - API Route Mismatch Fix

## Summary
Fixed all API route mismatches between the frontend and backend in the Kiwul Content Studio project. Created 15 missing API routes, fixed all `projectId` → `project_id` parameter mismatches, added GET/PATCH support to existing routes, and fixed response format inconsistencies.

## Missing API Routes Created

### Generate Endpoints (8 routes)
1. `/src/app/api/storyboard/generate/route.ts` - POST: Generates storyboard using LLM, creates storyboard + scenes in DB
2. `/src/app/api/script/generate/route.ts` - POST: Generates script using LLM, stores in project config_json
3. `/src/app/api/storyline/generate/route.ts` - POST: Generates storyline using LLM, stores in project config_json
4. `/src/app/api/locations/generate/route.ts` - POST: Generates locations using LLM, creates in DB
5. `/src/app/api/images/generate/route.ts` - POST: Generates scene images using image provider, saves to public/assets/
6. `/src/app/api/videos/generate/route.ts` - POST: Placeholder (returns 501, LTX/ComfyUI not yet configured)
7. `/src/app/api/voice/generate/route.ts` - POST: Placeholder (returns 501, F5-TTS not yet configured)
8. `/src/app/api/render/route.ts` - POST: Placeholder (returns 501, FFmpeg not yet configured)

### Resource Endpoints (7 routes)
9. `/src/app/api/ideas/[id]/route.ts` - PATCH: Update idea fields (title, hook, angle, etc.)
10. `/src/app/api/ideas/[id]/select/route.ts` - PATCH: Select idea, deselect all others in project
11. `/src/app/api/scenes/[id]/route.ts` - PATCH: Update scene fields via URL param
12. `/src/app/api/characters/[id]/route.ts` - PATCH: Update character fields
13. `/src/app/api/characters/[id]/reference/route.ts` - POST: Generate reference image for character
14. `/src/app/api/locations/[id]/route.ts` - PATCH: Update location fields
15. `/src/app/api/locations/[id]/reference/route.ts` - POST: Generate reference image for location

## Existing Routes Enhanced

- `/src/app/api/storyline/route.ts` - Added GET (fetch storyline from config) and PATCH (save storyline edits)
- `/src/app/api/script/route.ts` - Added GET (fetch script from config) and PATCH (save script edits)

## Frontend Parameter Fixes

### Query Parameter Fixes (projectId → project_id)
All 10 step components + 2 view components fixed:
- IdeaStep, StorylineStep, ScriptStep, StoryboardStep, CharacterStep, LocationStep, ImagesStep, VideosStep, VoiceStep, RenderStep
- StoryboardView, CharacterView

### POST Body Fixes (projectId → project_id)
All components that send POST/PATCH requests with project ID in body:
- Same 12 files as above

### Response Format Fixes
- **IdeaStep**: Handle `{ ideas: [...] }` response from `/api/ideas/generate`
- **CharacterStep/CharacterView**: Handle `{ characters: [...] }` response from `/api/characters/generate`
- **LocationStep**: Handle `{ locations: [...] }` response from `/api/locations/generate`
- **StoryboardStep/StoryboardView**: Handle array response from `/api/storyboard` GET (extract first storyboard)

## Verification
- `bun run lint` passes clean with no errors
- Dev server compiles successfully
