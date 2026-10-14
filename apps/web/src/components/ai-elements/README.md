# AI Elements for Chitchat

Adapted from Vercel AI Elements, pinned to commit [`6a9d5b1822ffb10bba4bd97175f01edd7d8651cd`](https://github.com/vercel/ai-elements/tree/6a9d5b1822ffb10bba4bd97175f01edd7d8651cd/packages/elements/src). The upstream MIT license is retained in `LICENSE`.

These are vendored components, following the AI Elements source-copy distribution model:

- `conversation.tsx` retains Conversation and ScrollButton's StickToBottom context. Content uses the same scroll/content refs and nesting as StickToBottom.Content, with attributes on the actual viewport for keyboard access, log semantics and rail navigation. It avoids the library's forced scrollbar gutters to preserve layout and respects reduced motion.
- `message.tsx` retains Message's role classes and composable MessageContent. Classes use Chitchat's existing theme. The domain supplies the small role union rather than pulling in AI SDK types.
- `prompt-input.tsx` retains the text form submission and composition-aware Enter/requestSubmit behavior. It uses existing Textarea/Button primitives. Controlled drafts remain with callers until validated success, and domain hooks own pending submissions and cancellation. Uploads, providers, tool selectors, stop controls, Markdown and code rendering are omitted because these chats use plain text.

Use these primitives and the shared `chat` components for chat interfaces onwards. Keep onboarding's validated streaming transport and voice transcripts independent of presentation. Update deliberately against the pinned upstream source; preserve local accessibility and theme adaptations.
