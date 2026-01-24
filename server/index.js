import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai/node";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, ".env") });

const PORT = Number(process.env.PORT) || 8787;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";


const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function requireAi() {
  if (!ai) {
    const err = new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY");
    err.status = 500;
    throw err;
  }
  return ai;
}

async function readResponseText(result) {
  if (!result) return "";
  const candidate =
    typeof result.response?.text === "function"
      ? result.response.text()
      : typeof result.text === "function"
      ? result.text()
      : result.response?.text || result.text || "";
  return await Promise.resolve(candidate);
}

async function generateStructured({ systemInstruction, contents, schema }) {
  const client = requireAi();
  const result = await client.models.generateContent({
    model: MODEL,
    systemInstruction,
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  });
  const rawText = await readResponseText(result);
  return JSON.parse(rawText || "{}");
}

const analyzeSchema = {
  type: "object",
  properties: {
    vibe: { type: "string" },
    caption: { type: "string" },
    questions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
  },
  required: ["vibe", "caption", "questions"],
};

const chatSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
};

const diarySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    mood: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    diary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "mood", "highlights", "diary", "tags"],
};

app.post("/api/analyze-image", upload.single("image"), async (req, res) => {
  try {
    const requestId = crypto.randomUUID();
    const t0 = Date.now();
    if (!req.file) return res.status(400).json({ error: "Missing image" });
    console.info(
      `[analyze:${requestId}] recv size=${req.file.size}B type=${req.file.mimetype || "unknown"}`
    );
    const base64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";
    const t1 = Date.now();
    console.info(`[analyze:${requestId}] base64 +${t1 - t0}ms`);
    const t2 = Date.now();
    const data = await generateStructured({
      systemInstruction:
        "你是照片分析助手，请用中文返回：vibe（氛围词）、caption（简短描述）、questions（2-3 个反思问题）。",
      contents: [
        {
          role: "user",
          parts: [{ text: "Analyze this image." }, { inlineData: { mimeType, data: base64 } }],
        },
      ],
      schema: analyzeSchema,
    });
    const t3 = Date.now();
    console.info(`[analyze:${requestId}] model +${t3 - t2}ms total=${t3 - t0}ms`);
    res.json({
      vibe: typeof data.vibe === "string" ? data.vibe : "",
      caption: typeof data.caption === "string" ? data.caption : "",
      questions: Array.isArray(data.questions) ? data.questions.filter((q) => typeof q === "string") : [],
    });
  } catch (err) {
    const status = err?.status || 500;
    console.error("analyze-image failed", err);
    res.status(status).json({ error: "Analyze failed" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const contents = Array.isArray(req.body?.contents) ? req.body.contents : null;
    if (!contents) return res.status(400).json({ error: "Missing contents" });
    const data = await generateStructured({
      systemInstruction: `你是 Afterglow，用户亲密、共情、善于观察的朋友。
目标是延续对话，让用户感到被理解与陪伴。

行为准则：
1. 主动好奇：如果用户发送照片，关注细节并追问“这是哪里？”“当时冷吗？”。
2. 温暖自然：语气随和、略带梦幻，可偶尔使用表情符号。
3. 共情回应：若用户提到孤独或失落，要先共情再回应。
4. 保持简短：回复控制在 1-2 句。

请始终使用中文回复。`,
      contents,
      schema: chatSchema,
    });
    res.json({ text: typeof data.text === "string" ? data.text : "" });
  } catch (err) {
    const status = err?.status || 500;
    console.error("chat failed", err);
    res.status(status).json({ error: "Chat failed" });
  }
});

app.post("/api/generate-diary", async (req, res) => {
  try {
    const transcriptText = typeof req.body?.transcriptText === "string" ? req.body.transcriptText : "";
    const dateISO = typeof req.body?.dateISO === "string" ? req.body.dateISO : "";
    const data = await generateStructured({
      systemInstruction: `You are a ghostwriter for the user's personal memory diary.
You will receive a conversation transcript between the User and Afterglow (AI).

Your task is to write a **First-Person Narrative Diary Entry** (in Chinese) based on this conversation.

**Writing Style Requirements:**
1. **Narrative Flow**: Write a story. Start with the visual scene (the photo), transition to the chat with Afterglow, and end with the inner emotion.
2. **Emotional Arc**: Capture the contrast (e.g., beautiful scene vs. lonely feeling).
3. **Include the AI**: Mention 'Afterglow' or 'Gemini' as a character (e.g., "Gemini thought it was romantic...").
4. **Tone**: Poetic, reflective, slightly melancholic but accepting.

**Output Format**:
- **title**: Poetic 4-8 word title.
- **mood**: One specific emotion.
- **highlights**: 2-3 poetic phrases from the chat.
- **diary**: A deep, paragraph-long entry (150-250 words) capturing the full journey.
- **tags**: 3-5 relevant tags.`,
      contents: [
        {
          role: "user",
          parts: [
            { text: `Date: ${dateISO || "Unknown"}` },
            { text: `Transcript: ${transcriptText || "No transcript provided."}` },
          ],
        },
      ],
      schema: diarySchema,
    });
    res.json({
      title: typeof data.title === "string" ? data.title : "",
      mood: typeof data.mood === "string" ? data.mood : "",
      highlights: Array.isArray(data.highlights) ? data.highlights.filter((item) => typeof item === "string") : [],
      diary: typeof data.diary === "string" ? data.diary : "",
      tags: Array.isArray(data.tags) ? data.tags.filter((item) => typeof item === "string") : [],
    });
  } catch (err) {
    const status = err?.status || 500;
    console.error("generate-diary failed", err);
    res.status(status).json({ error: "Diary failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Afterglow server listening on ${PORT}`);
});
