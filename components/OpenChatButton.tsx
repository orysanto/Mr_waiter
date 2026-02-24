"use client";
// components/OpenChatButton.tsx
// Client component that opens the chat widget via a custom DOM event.
// mode="order" opens directly to the order menu; mode="chat" opens the welcome chat.

export default function OpenChatButton({
  label = "💬 Ask Our AI Waiter",
  mode  = "chat",
  className = "",
}: {
  label?:     string;
  mode?:      "chat" | "order";
  className?: string;
}) {
  const handleClick = () => {
    // Option A: custom event — ChatWidget listens for this
    window.dispatchEvent(new CustomEvent("open-chat", { detail: { mode } }));
  };

  return (
    <button onClick={handleClick} className={className}>
      {label}
    </button>
  );
}
