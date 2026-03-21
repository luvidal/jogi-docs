# @jogi/docs — AI Document Processing Library

Standalone module for Chilean document classification, field extraction, and image processing.
Extracted from Jogi to isolate AI/document complexity and enable independent testing.

## Compact Instructions

When compacting, preserve: file paths changed, errors found, decisions made, model behavior changes. Drop: full file contents already read, tool output bodies.

## Communication Style

- **No emotional validation** — never say "I understand your frustration". Results matter, not words.
- **No excessive apologies** — don't apologize repeatedly. Fix the problem.
- **Be direct** — state facts, propose solutions, execute. Skip the fluff.
- **Ask for input** — when stuck or facing multiple approaches, ask rather than guessing.

## Tech Stack

- **Runtime**: Node.js (server-side only, no React)
- **Build**: tsup (ESM + CJS + types)
- **Tests**: vitest
- **AI**: Gemini 2.0 Flash (primary), Claude Haiku (fallback), GPT-4o
- **Image**: sharp
- **Face Detection**: AWS Rekognition
- **PDF**: pdf-lib, pdf-to-png-converter

## Project Structure

```
src/
├── index.ts              # Server entry (heavy deps)
├── doctypes/index.ts     # Universal entry (no heavy deps)
├── multipart/index.ts    # Universal entry (no heavy deps)
├── types.ts              # All type definitions
├── config.ts             # configure() — pluggable logger
├── ai.ts                 # Multi-model LLM abstraction
├── ocr.ts                # Doc2Fields pipeline
├── faceextract.ts        # Face extraction (V4, AWS Rekognition)
├── cedula.ts             # Composite cedula detection/splitting
├── cedulamerge.ts        # Front/back field merging
├── thumbnail.ts          # Pure thumbnail generation
├── doctypes.ts           # Doctype utilities
├── doctypes.json         # Document type definitions
├── multipart.ts          # Multi-part document utilities
└── utils.ts              # safeJsonParse, helpers
```

## Code Rules

1. **File naming** → lowercase, no hyphens/underscores (e.g., `facedetect.ts`)
2. **No `@/` imports** → all imports are relative within `src/`
3. **Three entry points**:
   - `@avd/docprocessor` — server-only (sharp, AI SDKs)
   - `@avd/docprocessor/doctypes` — universal (safe for frontend)
   - `@avd/docprocessor/multipart` — universal (safe for frontend)
4. **Error handling** → use `getLogger()` from `config.ts`, never import Sentry
5. **Environment** → API keys read from `process.env` (GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY)
6. **README.md maintenance** — every modification to a feature area must update its `docs/` or inline README to reflect changes
7. **Test coverage** — after implementing a feature, check if tests exist. Update or write tests. Never leave a feature without test coverage.
8. **Planning** — for non-trivial changes, write a plan to `docs/plans/` before implementing

## Commands

- `npm run build` — Build dist/ (ESM + CJS + types)
- `npm run dev` — Build in watch mode
- `npm test` — Run unit tests
- `npm run test:watch` — Watch mode
- `npm run cli -- <file>` — Test extraction on a file

## Testing Individual Files

API keys live in Jogi's `.env.local`. Source them before running:

```bash
# Basic field extraction (any document)
source /Users/avd/GitHub/jogi/.env.local && npx tsx dev/cli.ts <file> [model]

# Full cedula pipeline (composite split + fields + face extraction)
source /Users/avd/GitHub/jogi/.env.local && npx tsx dev/test-cedula.ts <cedula-image> [model]
```

- `model` defaults to `gemini`. Options: `gemini`, `claude`, `gpt5`
- `dev/cli.ts` — runs `Doc2Fields` and prints JSON
- `dev/test-cedula.ts` — runs V3 composite split, field extraction per side, face extraction via Rekognition. Saves cropped front/back images, face avatar, and fields JSON to `~/Desktop/tmp_cedula/`
- AWS credentials for Rekognition are in `~/.aws/credentials` (default profile)

## Validation

Use `npx tsc --noEmit` for type checking. Run `npm test` before committing.

## Consumer Integration

Consumed by Jogi via GitHub reference:
```json
"@avd/docprocessor": "github:luvidal/docprocessor#main"
```

Jogi wires its Sentry logger at startup:
```typescript
import { configure } from '@avd/docprocessor'
configure({ logger: { error: captureError, warn: console.warn } })
```
