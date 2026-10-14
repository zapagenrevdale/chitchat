import type { ReactElement } from "react";

import { Message, MessageContent } from "@/components/ai-elements/message";

export function ConversationMessage({
  message,
  transcriptId,
  name,
  avatar,
}: {
  message: { id: string | number; speaker: "user" | "partner"; text: string };
  transcriptId: string;
  name: string;
  avatar?: string | ReactElement;
}) {
  return (
    <Message
      from={message.speaker === "user" ? "user" : "assistant"}
      id={`${transcriptId}-${message.id}`}
    >
      {message.speaker === "partner" &&
        (typeof avatar === "string" ? (
          <img
            src={avatar}
            alt=""
            width={32}
            height={32}
            className="bg-card size-8 shrink-0 rounded-full"
          />
        ) : (
          (avatar ?? (
            <span
              aria-hidden="true"
              className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-sm"
            >
              {name[0]}
            </span>
          ))
        ))}
      <MessageContent>
        <span className="sr-only">
          {message.speaker === "user" ? "You" : name}:{" "}
        </span>
        {message.text}
      </MessageContent>
    </Message>
  );
}
