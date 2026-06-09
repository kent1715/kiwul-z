# Task 10-12: Backend API Routes

**Agent**: Backend API Developer
**Status**: Completed

## Summary
Created all 17 API routes for the Kiwul Content Studio backend, plus a shared LLM helper utility.

## Files Created

1. `/src/lib/llm.ts` - Shared LLM utility (provider lookup, LLM calls, JSON parsing, prompt templates)
2. `/src/app/api/projects/route.ts` - GET/POST
3. `/src/app/api/projects/[id]/route.ts` - GET/PATCH/DELETE
4. `/src/app/api/ideas/route.ts` - GET/POST
5. `/src/app/api/ideas/generate/route.ts` - POST (LLM)
6. `/src/app/api/storyline/route.ts` - POST (LLM)
7. `/src/app/api/script/route.ts` - POST (LLM)
8. `/src/app/api/storyboard/route.ts` - GET/POST (LLM)
9. `/src/app/api/scenes/route.ts` - GET/PATCH
10. `/src/app/api/characters/route.ts` - GET/POST
11. `/src/app/api/characters/generate/route.ts` - POST (LLM)
12. `/src/app/api/locations/route.ts` - GET/POST (with LLM generate option)
13. `/src/app/api/providers/route.ts` - GET/POST/PATCH
14. `/src/app/api/providers/test/route.ts` - POST (connection test)
15. `/src/app/api/generate/image/route.ts` - POST (image gen + save to public/assets/)
16. `/src/app/api/generate/image-prompt/route.ts` - POST (LLM)
17. `/src/app/api/generate/motion-prompt/route.ts` - POST (LLM)
18. `/src/app/api/seed/route.ts` - POST (seed providers + templates)

## Lint
All routes pass ESLint with zero errors.
