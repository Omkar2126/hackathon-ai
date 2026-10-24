import { db } from "@/db";
import { conversations, memories, people, visits } from "@/db/schema";
import { embedText } from "@/lib/embeddings";

const daysAgo = (days: number, hours = 10) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, 12, 0, 0);
  return date;
};

export async function ensureSeed() {
  const existing = await db.select({ id: people.id }).from(people).limit(1);
  if (existing.length > 0) return;

  const inserted = await db
    .insert(people)
    .values([
      {
        name: "Sarah Chen",
        relationship: "Daughter",
        notes:
          "Visits most Sundays. Lives in Seattle. Golden retriever named Maple. Just started a new job at a design studio.",
        avatarUrl: "/images/sarah.jpg",
        lastSeenAt: daysAgo(0, 9),
      },
      {
        name: "Michael Brooks",
        relationship: "Son",
        notes:
          "Lives twenty minutes away. Carpenter. Brings soup when the weather turns. Has a daughter named Maya.",
        avatarUrl: "/images/michael.jpg",
        lastSeenAt: daysAgo(2, 16),
      },
      {
        name: "James Hale",
        relationship: "Grandson",
        notes:
          "Architecture student. Plays guitar in the evenings. Shows campus photos on his phone.",
        avatarUrl: "/images/james.jpg",
        lastSeenAt: daysAgo(5, 14),
      },
      {
        name: "Rosa Alvarez",
        relationship: "Neighbor",
        notes:
          "Brings garden tomatoes. Walks with Margaret on Tuesdays. Knows where the spare kettle lives.",
        avatarUrl: "/images/rosa.jpg",
        lastSeenAt: daysAgo(1, 11),
      },
      {
        name: "Dr. Amira Patel",
        relationship: "Neurologist",
        notes:
          "Clinic visits on the first Thursday. Reviews donepezil in the morning. Speaks slowly and kindly.",
        avatarUrl: "/images/amira.jpg",
        lastSeenAt: daysAgo(12, 13),
      },
    ])
    .returning();

  const byName = Object.fromEntries(inserted.map((person) => [person.name, person]));

  const memoryRows = [
    {
      person: byName["Sarah Chen"],
      category: "family",
      content: "Sarah is Margaret's daughter. She visits most Sundays and always hugs first.",
    },
    {
      person: byName["Sarah Chen"],
      category: "work",
      content: "Sarah started a new job at a design studio in Seattle.",
    },
    {
      person: byName["Sarah Chen"],
      category: "pet",
      content: "Sarah's golden retriever is named Maple.",
    },
    {
      person: byName["Sarah Chen"],
      category: "plan",
      content: "Sarah is bringing lemon cake for Sunday dinner.",
    },
    {
      person: byName["Michael Brooks"],
      category: "family",
      content: "Michael is Margaret's son. He lives twenty minutes away.",
    },
    {
      person: byName["Michael Brooks"],
      category: "work",
      content: "Michael works as a carpenter and recently fixed the kitchen tap.",
    },
    {
      person: byName["Michael Brooks"],
      category: "family",
      content: "Michael's daughter Maya made a paper bird for Margaret.",
    },
    {
      person: byName["James Hale"],
      category: "family",
      content: "James is Margaret's grandson. He studies architecture.",
    },
    {
      person: byName["James Hale"],
      category: "hobby",
      content: "James plays guitar and likes to sit by the window.",
    },
    {
      person: byName["Rosa Alvarez"],
      category: "neighbor",
      content: "Rosa lives next door and brings tomatoes from her garden.",
    },
    {
      person: byName["Rosa Alvarez"],
      category: "routine",
      content: "Rosa and Margaret walk together on Tuesday mornings.",
    },
    {
      person: byName["Dr. Amira Patel"],
      category: "health",
      content: "Dr. Patel is Margaret's neurologist. Appointments are on the first Thursday.",
    },
    {
      person: byName["Dr. Amira Patel"],
      category: "health",
      content: "Morning medication is donepezil with breakfast.",
    },
  ];

  await db.insert(memories).values(
    memoryRows.map((row) => ({
      personId: row.person.id,
      content: row.content,
      category: row.category,
      embedding: embedText(row.content),
    })),
  );

  const conversationSeed = [
    {
      person: byName["Sarah Chen"],
      createdAt: daysAgo(0, 9),
      transcript:
        "Hi Mom, it's Sarah. Maple already stole a sock. I started that new job in Seattle — the studio has a huge window. I'll bring lemon cake on Sunday, the one you like.",
      summary: "Sarah visited this morning and talked about her new Seattle studio job and Sunday lemon cake.",
      reminder: "This is Sarah, your daughter. She started a new job in Seattle and is bringing lemon cake on Sunday.",
      keyFacts: [
        "Sarah is Margaret's daughter",
        "New design-studio job in Seattle",
        "Bringing lemon cake on Sunday",
        "Dog named Maple",
      ],
    },
    {
      person: byName["Michael Brooks"],
      createdAt: daysAgo(2, 16),
      transcript:
        "Hey Mom, Michael. I tightened the kitchen tap so it shouldn't drip tonight. Maya made you a paper bird. I'll leave soup in the fridge.",
      summary: "Michael fixed the kitchen tap, left soup, and brought a paper bird from Maya.",
      reminder: "This is Michael, your son. He fixed the kitchen tap and left soup in the fridge.",
      keyFacts: [
        "Michael is Margaret's son",
        "Fixed the kitchen tap",
        "Left soup in the fridge",
        "Maya made a paper bird",
      ],
    },
    {
      person: byName["Rosa Alvarez"],
      createdAt: daysAgo(1, 11),
      transcript:
        "Margaret, it's Rosa from next door. I brought tomatoes. If the weather holds we can walk Tuesday like always. The kettle is on the left burner.",
      summary: "Rosa brought garden tomatoes and confirmed their Tuesday walk.",
      reminder: "This is Rosa, your neighbor. She brought tomatoes and will walk with you on Tuesday.",
      keyFacts: [
        "Rosa is the neighbor",
        "Brought garden tomatoes",
        "Tuesday morning walks",
        "Kettle is on the left burner",
      ],
    },
    {
      person: byName["James Hale"],
      createdAt: daysAgo(5, 14),
      transcript:
        "Grandma, it's James. I wanted to show you the library I sketched at school. I can play that slow song later if you want.",
      summary: "James showed campus sketches and offered to play guitar later.",
      reminder: "This is James, your grandson. He studies architecture and plays guitar for you.",
      keyFacts: [
        "James is Margaret's grandson",
        "Studies architecture",
        "Plays guitar",
        "Showed a library sketch",
      ],
    },
    {
      person: byName["Dr. Amira Patel"],
      createdAt: daysAgo(12, 13),
      transcript:
        "Margaret, it's Dr. Patel. Your memory exercises are going well. Keep taking donepezil with breakfast. We'll see each other the first Thursday.",
      summary: "Dr. Patel reviewed memory exercises and reminded Margaret about morning donepezil.",
      reminder: "This is Dr. Patel, your neurologist. Take donepezil with breakfast. Next visit is the first Thursday.",
      keyFacts: [
        "Dr. Patel is the neurologist",
        "Donepezil with breakfast",
        "Memory exercises are going well",
        "Clinic on the first Thursday",
      ],
    },
  ];

  await db.insert(conversations).values(
    conversationSeed.map((row) => ({
      personId: row.person.id,
      transcript: row.transcript,
      summary: row.summary,
      reminder: row.reminder,
      keyFacts: row.keyFacts,
      embedding: embedText(`${row.summary} ${row.transcript}`),
      source: "whisper",
      createdAt: row.createdAt,
    })),
  );

  await db.insert(visits).values([
    {
      personId: byName["Sarah Chen"].id,
      startedAt: daysAgo(0, 9),
      endedAt: daysAgo(0, 10),
      greeting: "This is Sarah, your daughter.",
    },
    {
      personId: byName["Rosa Alvarez"].id,
      startedAt: daysAgo(1, 11),
      endedAt: daysAgo(1, 12),
      greeting: "This is Rosa, your neighbor.",
    },
    {
      personId: byName["Michael Brooks"].id,
      startedAt: daysAgo(2, 16),
      endedAt: daysAgo(2, 17),
      greeting: "This is Michael, your son.",
    },
  ]);
}
