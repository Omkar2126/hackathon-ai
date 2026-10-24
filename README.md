# Lumen: AI Dementia Memory & Multi-Face Assistant 🧠✨

> 🌐 **Live Demo**: [https://hackathon-ai-rc3l.vercel.app/](https://hackathon-ai-rc3l.vercel.app/)
>
> An empathetic, real-time visual and conversational memory companion designed to help people living with dementia recognize loved ones, remember personal stories, and feel grounded and dignified at home.

---

## 📖 Table of Contents
- [Overview](#-overview)
- [Key Features](#-key-features)
- [Complete Tech Stack](#-complete-tech-stack)
- [APIs & Models: Which, Where & Why](#-apis--models-which-where--why)
- [Database Architecture: Why PostgreSQL & Drizzle](#-database-architecture-why-postgresql--drizzle)
- [System Architecture & Data Flow](#-system-architecture--data-flow)
- [Environment Variables (.env.local)](#-environment-variables-envlocal)
- [Getting Started & Local Setup](#-getting-started--local-setup)
- [Folder Structure](#-folder-structure)

---

## 🌟 Overview

For individuals living with Alzheimer's disease or related dementias, familiar faces and recent memories can slip away, causing distress, confusion, and anxiety. 

**Lumen** acts as a gentle cognitive prosthetic:
1. **Multi-Face Real-Time Recognition**: Detects multiple people in the camera frame simultaneously, identifies them against known family profiles, and attaches friendly, floating identity chips (`Sarah Chen · Daughter`, `James Hale · Grandson`).
2. **Contextual Memory Cues**: When a person enters the room, Lumen quietly surfaces a concise summary (< 18 words) of who they are, their last visit, and key facts (e.g. *"Sarah started a new job at a design studio in Seattle and has a golden retriever named Maple"*).
3. **Conversational Fact Extraction**: Listens to live conversation using Whisper, extracts durable life facts using Gemma, and stores them in the patient's long-term memory graph.
4. **Caregiver Dashboard**: Allows family members and clinical caregivers to manage the patient's care circle, upload photo embeddings, review visit logs, and inspect conversation transcripts.

---

## 🚀 Key Features

- **Multi-Face Detection & Tracking**:
  - Detects up to 6 faces concurrently with low-latency MediaPipe BlazeFace.
  - Smart collision-avoidance layout ensures detail cards never cover faces.
  - Interactive face focus: click any person to view their specific memories and relationship recap.
- **"Family in View" Room Presence HUD**:
  - Displays a floating banner when multiple family members or visitors are present (e.g. `👥 Family Present (2): Sarah Chen & James Hale`).
- **Accessible Conversational Memory Chatbot ("Ask Lumen")**:
  - Empathetic AI memory companion accessible on every screen via a floating assistant orb or a dedicated `/chat` view.
  - **Dementia-friendly language**: short, calming, unambiguous answers grounded strictly in verified family notes and memories.
  - **Visual Face Chips**: renders recognized photos and relationship tags right in chat messages so faces are instantly recognizable.
  - **Voice Input (STT)**: one-tap microphone input so users don't need to struggle with keyboards.
  - **Voice Read Aloud (TTS)**: gentle, soothing speech synthesis speaks answers aloud.
  - **Accessibility text sizing**: standard, large, and extra-large typography toggles for senior accessibility.
- **Empathetic Spoken Voice**:
  - Uses Web Speech synthesis to deliver gentle audio announcements (e.g. *"Both Sarah and James are here with you"*).
- **Unknown Face Enrollment**:
  - Instant one-click face enrollment allows family members to name a new visitor on the spot; Lumen captures their facial embedding and remembers them for future visits.
- **Multi-Scenario Interactive Demo Scene**:
  - Works out of the box even without a camera using photorealistic living room scenes with 2-face, 3-face, and new visitor presets.

---

## 🛠 Complete Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | **Next.js 16 (App Router, Turbopack)** | Server Components, fast route transitions, and rapid developer iteration with Turbopack. |
| **UI & Language** | **React 19 & TypeScript 5.9** | Strict type safety across client state, DB schemas, and API contracts. |
| **Styling** | **Tailwind CSS v4 & Vanilla CSS** | Curated warm palette (`--bg: #0c0a08`, `--paper: #f4eee4`, `--gold: #e0b56a`), glassmorphism, HUD badges. |
| **On-Device Vision** | **Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)** | BlazeFace short-range detection running locally in WASM with GPU / CPU delegates. |
| **Facial Embeddings** | **HTML5 Canvas & Spatial Descriptors** | 64-dimensional normalized spatial luminance and color feature extraction for zero-network facial recognition. |
| **Speech-to-Text** | **Whisper & Web Speech API** | Transcribes family speech to extract facts. |
| **Intelligence & LLM** | **Gemma & Google Gemini** | Generates short, dignified memory prompts and extracts factual memory bullets. |
| **Database** | **PostgreSQL (v16+)** | Relational data integrity, cascade deletion, and vector storage. |
| **ORM & Migrations** | **Drizzle ORM (`drizzle-orm`, `drizzle-kit`)** | Type-safe queries, schema generation, and automatic push migrations. |

---

## 🤖 APIs & Models: Which, Where & Why

### 1. Google MediaPipe Tasks Vision (BlazeFace Short-Range)
- **Where**: `src/components/LiveAssist.tsx` (Client-side camera loop)
- **Why**: 
  - **Zero Privacy Risk**: Runs **100% on the patient's device** using WebAssembly and WebGL. Camera feeds are never uploaded to a cloud server.
  - **Multi-Face Performance**: BlazeFace detects multiple faces in 10–20ms per frame, ensuring smooth 60fps tracking on laptops and tablets.
  - **Robustness**: Tuned with `minDetectionConfidence: 0.35` and `minSuppressionThreshold: 0.3` to catch angled, turned, or partially occluded faces.

### 2. OpenAI / Fireworks Whisper (Speech-to-Text)
- **Where**: `src/lib/whisper.ts` and `src/app/api/transcribe/route.ts`
- **Why**:
  - Elderly speech and multi-speaker living room chatter can be challenging for standard speech recognition.
  - Whisper filters background noise and handles conversational cadences with high word-accuracy.
  - Features an instant automatic fallback to the browser's native `SpeechRecognition` if offline or if no API key is provided.

### 3. Google Gemma / Gemini (Dementia Memory Reasoning)
- **Where**: `src/lib/gemma.ts`, `src/app/api/infer/route.ts`, `src/app/api/conversations/route.ts`
- **Why**:
  - Standard LLMs generate long, robotic paragraphs that overwhelm individuals with dementia.
  - Gemma is specifically prompted with a clinical persona:
    - Sentences must be **under 18 words**.
    - Tone must be **warm, dignified, and grounding**.
    - Explicitly extracts durable facts (jobs, pets, family events) while discarding filler.
  - **Multi-Provider Support**: Supports local **Ollama** (`gemma3:1b`), **Groq** (`gemma2-9b-it`), **Google Gemini** (`gemma-3-12b-it`), **Fireworks AI**, and **OpenRouter**, with a built-in heuristic context engine when fully offline.

---

## 🗄 Database Architecture: Why PostgreSQL & Drizzle

### Why PostgreSQL?
1. **Relational Integrity**:
   - A dementia care app requires strict relationships between people, their biometric facial prototype vectors, historical visit timestamps, and memory graphs.
   - Cascading deletes ensure that removing a person cleanly wipes their associated face embeddings and visit logs.
2. **Vector & Embedding Similarity Storage**:
   - PostgreSQL `JSONB` columns store:
     - **Facial prototype vectors**: Averaged 64-dimensional feature arrays representing each person's face.
     - **Memory semantic vectors**: 128-dimensional normalized text embeddings for similarity search over past conversations.
   - In-database cosine similarity queries allow real-time matching against enrolled profiles in under 15ms.
3. **Caregiver Auditability**:
   - Automatically maintains timestamps (`last_seen_at`, `created_at`) to alert caregivers when a close family member hasn't visited recently.

### Schema Overview (`src/db/schema.ts`)

```
┌─────────────────┐       1 : N       ┌──────────────────────┐
│     people      │ ────────────────> │   face_embeddings    │
│  id (UUID, PK)  │                   │  id, embedding (JSON)│
│  name, notes    │                   └──────────────────────┘
│  avatar_url     │       1 : N       ┌──────────────────────┐
│  last_seen_at   │ ────────────────> │    conversations     │
└─────────────────┘                   │  transcript, summary │
        │                             │  reminder, key_facts │
        │ 1 : N                       └──────────────────────┘
        │                                        │ 1 : N
        ▼                                        ▼
┌─────────────────┐                   ┌──────────────────────┐
│     visits      │                   │       memories       │
│  started_at     │                   │  content, category   │
│  greeting       │                   │  embedding (JSON)    │
└─────────────────┘                   └──────────────────────┘
```

### Why Drizzle ORM?
- **Zero-Overhead SQL**: Compiles to raw, optimized SQL queries without heavyweight runtime engines.
- **End-to-End TypeScript Invariance**: Any schema change in `schema.ts` instantly surfaces TypeScript compile errors across API routes and components before runtime.
- **Fast Migration Push**: `npx drizzle-kit push` synchronizes schemas directly with PostgreSQL without manual SQL migration boilerplate.

---

## 🔄 System Architecture & Data Flow

```
[ Camera Stream / Video Feed ]
              │
              ▼
    MediaPipe BlazeFace  ───(Detects 1 to 6 faces)───►  [ Multi-Track Matcher ]
              │                                                     │
              ▼ (Crop 64x64)                                        ▼
    Spatial Face Descriptor                              [ Collision-Free HUD ]
              │                                                     │
              ▼ POST /api/recognize                                 ├─► "Family Present" Banner
    [ PostgreSQL Prototypes ]                                       ├─► Attached Face Chips
              │                                                     └─► Memory / Reminder Card
              ▼ Cosine Match (Score >= 0.82)
    { person, reminder, keyFacts }
              │
              ▼
[ Speech Synthesis Utterance ] ──► "Sarah and James are in the room."
```

---

## 🔑 Environment Variables (.env.local)

Create a `.env.local` file in `ai-dementia-memory-assistant/`:

```env
# Database Connection (PostgreSQL)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/app_db

# Optional AI Services (App automatically falls back to local Gemma / on-device if blank)
# GROQ_API_KEY=gsk_...
# GEMINI_API_KEY=AIzaSy...
# OPENAI_API_KEY=sk-...
# FIREWORKS_API_KEY=fw_...
```

> **Note**: Even with zero API keys configured, Lumen will run completely offline using local facial descriptors, browser speech synthesis, and on-device context engines!

---

## 💻 Getting Started & Local Setup

### 1. Prerequisites
- **Node.js**: v20 or v22+
- **PostgreSQL**: Running locally or via Supabase / Docker (port 5432)

### 2. Install Dependencies
```bash
cd ai-dementia-memory-assistant
npm install
```

### 3. Setup PostgreSQL Database
Make sure PostgreSQL is running, then create the database:
```sql
CREATE DATABASE app_db;
```

Push the database tables:
```bash
npx drizzle-kit push
```

### 4. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Folder Structure

```
ai-dementia-memory-assistant/
├── public/
│   └── images/               # High-resolution photorealistic avatar portraits & demo rooms
│       ├── living-room.jpg   # Photorealistic elderly living room backdrop
│       ├── sarah.jpg         # Sarah Chen (Daughter) portrait
│       ├── james.jpg         # James Hale (Grandson) portrait
│       ├── michael.jpg       # Michael Brooks (Son) portrait
│       ├── rosa.jpg          # Rosa Alvarez (Neighbor) portrait
│       └── amira.jpg         # Dr. Amira Patel (Neurologist) portrait
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── context/      # Retrieves person summary & recent memories
│   │   │   ├── conversations/# Logs transcripts & triggers Gemma extraction
│   │   │   ├── infer/        # Gemma inference endpoint
│   │   │   ├── memories/     # Caregiver memory list & creation
│   │   │   ├── people/       # Circle of care CRUD & face enrollment
│   │   │   ├── recognize/    # Vector similarity search over face prototypes
│   │   │   ├── transcribe/   # Whisper speech-to-text bridge
│   │   │   └── visits/       # Tracks presence and greetings
│   │   ├── caregiver/        # Caregiver management board
│   │   ├── memories/         # Full memory archive & categorization
│   │   ├── people/           # Family & care circle directory
│   │   ├── globals.css       # Design system, glassmorphism, animations
│   │   ├── layout.tsx        # App root layout & Google Fonts
│   │   └── page.tsx          # Live Assist main screen
│   ├── components/
│   │   ├── AppShell.tsx      # Navigation header & persistent links
│   │   ├── CaregiverBoard.tsx# Caregiver overview & visit statistics
│   │   ├── LiveAssist.tsx    # Multi-face detection, HUD overlays, speech
│   │   ├── MemoriesBoard.tsx # Memory card grid & search
│   │   └── PeopleBoard.tsx   # People directory & photo enrollment
│   ├── db/
│   │   ├── index.ts          # PostgreSQL connection pool & Drizzle instance
│   │   └── schema.ts         # Relational tables, foreign keys, JSONB vectors
│   └── lib/
│       ├── embeddings.ts     # 128-dim text embedding & cosine similarity
│       ├── face-embed.ts     # 64-dim face descriptor, IoU, bounding box lerp
│       ├── gemma.ts          # Gemma clinical memory extraction prompt & engine
│       ├── seed.ts           # Initial seed data for patient Margaret
│       ├── time.ts           # Dementia-friendly relative time formatters
│       ├── types.ts          # Shared TypeScript models
│       └── whisper.ts        # Whisper API audio transcription client
├── drizzle.config.json       # Drizzle Kit configuration
├── package.json              # Project dependencies & scripts
└── tsconfig.json             # TypeScript configuration
```

---

## 💡 Clinical Design Principles

- **No Jarring Popups**: Overlays glide onto the stage with smooth easing and gentle gold and sage hues.
- **Short Sentences**: Memory prompts are strictly constrained to under 18 words to prevent cognitive overload.
- **Dignity First**: Never treats the patient condescendingly; all phrasing is respectful, calm, and grounded in the comfort of home.
