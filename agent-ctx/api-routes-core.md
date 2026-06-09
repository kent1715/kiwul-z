# Task: Create/Overwrite Core API Routes for Kiwul Content Studio

## Summary

Created/overwrote 9 API route files for LLM-powered generation and provider management. All routes now use the `@/server/providers` module (`getProviderConfig`, `generateJSON`, `testProviderConnection`) instead of the deprecated `@/lib/llm` module. Routes also use `storyline_json` and `script_json` fields on the Project model instead of storing everything in `config_json`.

## Files Created/Overwritten

| # | File | Status | Description |
|---|------|--------|-------------|
| 1 | `src/app/api/providers/test/route.ts` | **NEW** | POST - Test provider connection by type |
| 2 | `src/app/api/seed/route.ts` | **OVERWRITTEN** | POST - Seed default providers (Edge-TTS default, proper config_json) and prompt templates (6 types) |
| 3 | `src/app/api/ideas/generate/route.ts` | **OVERWRITTEN** | POST - Generate ideas from LLM using idea template, delete unselected, update project status |
| 4 | `src/app/api/storyline/generate/route.ts` | **OVERWRITTEN** | POST - Generate storyline from LLM using selected idea + storyline template, save to `storyline_json` |
| 5 | `src/app/api/script/generate/route.ts` | **OVERWRITTEN** | POST - Generate script from LLM using storyline + script template, save to `script_json` |
| 6 | `src/app/api/storyboard/generate/route.ts` | **OVERWRITTEN** | POST - Generate full storyboard with scenes, then auto-generate image_prompt/motion_prompt via image template |
| 7 | `src/app/api/characters/generate/route.ts` | **OVERWRITTEN** | POST - Generate characters with visual_prompt, negative_prompt, visual_consistency_prompt |
| 8 | `src/app/api/locations/generate/route.ts` | **OVERWRITTEN** | POST - Generate locations with visual_style, lighting, camera_style, consistency_prompt |
| 9 | `src/app/api/ideas/[id]/select/route.ts` | **OVERWRITTEN** | PATCH - Select idea, deselect others, update project status to `idea_selected` |

## Key Changes from Old Implementation

1. **Provider imports**: `@/lib/llm` → `@/server/providers` (getProviderConfig, generateJSON, testProviderConnection)
2. **LLM config**: Uses `getProviderConfig<LLMConfig>('llm')` which returns typed config with `enabled` check
3. **JSON generation**: Uses `generateJSON(config, systemPrompt, userPrompt)` which auto-parses and has repair attempts
4. **Data storage**: Storyline → `project.storyline_json`, Script → `project.script_json` (instead of `config_json`)
5. **Template filling**: Uses global `.replace(/{var}/g, ...)` for consistent variable replacement
6. **Seed defaults**: Edge-TTS as default TTS (was F5-TTS), proper config_json with all fields
7. **Storyboard**: Auto-generates image_prompt and motion_prompt via second LLM call using image template
8. **Idea select**: Now updates project status to `idea_selected`
9. **TypeScript**: Fixed `never[]` array inference issues with `any[]` type annotations

## Prompt Templates Updated in Seed

- `idea` - 3 ideas with conflict_or_value, visual_potential, estimated_duration
- `storyline` - Full storyline structure with emotional_arc, visual_arc, cta
- `script` - Parts/scenes structure with detailed visual_description
- `storyboard` - Full storyboard with character_ids, location_id, camera
- `character` - Characters with visual_prompt, negative_prompt, visual_consistency_prompt
- `image` - Image + motion prompts for LTX video generation

## Verification

- `bun run lint` — passes with no errors
- `npx tsc --noEmit` — no errors in our route files
- Dev server compiles routes successfully (edge-tts module error is pre-existing, not caused by our changes)
