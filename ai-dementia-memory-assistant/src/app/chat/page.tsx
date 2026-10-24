import { AppShell } from "@/components/AppShell";
import { ChatBoard } from "@/components/ChatBoard";

export const metadata = {
  title: "Chat — Lumen Memory Assistant",
  description:
    "An accessible conversational memory assistant for individuals living with dementia and their caregivers.",
};

export default function ChatPage() {
  return (
    <AppShell>
      <ChatBoard />
    </AppShell>
  );
}
