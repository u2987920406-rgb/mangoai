import UserBubble from "./UserBubble.jsx";
import AssistantBubble from "./AssistantBubble.jsx";
import ThinkingIndicator from "./ThinkingIndicator.jsx";

// Fil de messages du mode chat — voile gris-violet léger qui encadre la conversation.
export default function ConversationThread({ messages, thinking, modelLabel, onRegenerate, onFeedback, bottomRef }) {
  return (
    <div className="flex-1 overflow-y-auto nice-scroll px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div
          className="flex flex-col gap-10 rounded-3xl border border-accent/10 px-7 py-9 shadow-xl shadow-black/20"
          style={{ backgroundColor: "rgba(124, 92, 255, 0.045)" }}
        >
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserBubble key={i} content={m.content} thinking={thinking} onRegenerate={() => onRegenerate(i)} />
            ) : (
              <AssistantBubble key={i} content={m.content} onFeedback={onFeedback} />
            )
          )}
          {thinking && <ThinkingIndicator label={modelLabel} />}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
