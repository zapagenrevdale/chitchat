import { useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ChatInput } from "@/components/chat/chat-input";
import { ConversationMessage } from "@/components/chat/conversation-message";
import { ChitAvatar } from "@/components/ui/chit-avatar";

export function ChatInputPreview() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);

  function send() {
    if (!draft.trim()) {
      return;
    }
    setMessages((previous) => [...previous, draft.trim()]);
    setDraft("");
    input.current?.focus();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Conversation className="mb-8">
        <ConversationContent
          aria-label="Chat preview"
          className="max-h-80"
          contentClassName="gap-5 p-1"
        >
          <ConversationMessage
            transcriptId="theme-chat"
            name="Chit"
            avatar={<ChitAvatar size={32} />}
            message={{
              id: 0,
              speaker: "partner",
              text: "Hey, I’m Chit. What would you like to feel more confident talking about?",
            }}
          />
          {messages.map((text, index) => (
            <ConversationMessage
              key={index}
              transcriptId="theme-chat"
              name="Chit"
              message={{ id: index + 1, speaker: "user", text }}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <ChatInput
        value={draft}
        onChange={setDraft}
        onSend={send}
        inputRef={input}
        label="Message Chit"
        placeholder="Tell Chit what’s on your mind…"
        sendLabel="Send message"
        describedBy="theme-chat-hint"
      />
      <output
        id="theme-chat-hint"
        className="text-muted-foreground mt-4 block text-center text-sm leading-relaxed"
      >
        Preview only · Enter to send, Shift + Enter for a new line.
      </output>
    </div>
  );
}
