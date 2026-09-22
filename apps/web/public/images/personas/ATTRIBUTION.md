# Persona avatars

Lorelei artwork by Lisa Wischofsky, dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- [DiceBear style and source information](https://www.dicebear.com/styles/lorelei/)
- [Original artwork](https://www.figma.com/community/file/1198749693280469639)
- Generator: `@dicebear/core` 9.4.3 and `@dicebear/lorelei` 9.4.2.

Chitchat curates one portrait per fictional persona. Every hairstyle is unique within the cast. Facial features and expressions are fixed in `apps/backend/src/practice/persona-avatars.ts`; this is art direction, not an inference about anyone's appearance from a name or voice.

Run `bun run generate:avatars` from the repository root to reproduce these SVGs. Generation runs locally using development dependencies; the app serves the saved SVGs without contacting DiceBear or bundling its generator.
