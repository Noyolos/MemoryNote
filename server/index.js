import express from "express";
import multer from "multer";
import dotenv from "dotenv";
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
    if (!req.file) return res.status(400).json({ error: "Missing image" });
    const base64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";
    const data = await generateStructured({
      systemInstruction:
        "You are an assistant that analyzes a photo and returns a short vibe, a concise caption, and 2-3 reflective questions.",
      contents: [
        {
          role: "user",
          parts: [{ text: "Analyze this image." }, { inlineData: { mimeType, data: base64 } }],
        },
      ],
      schema: analyzeSchema,
    });
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
      systemInstruction: "You are Afterglow, a calm, reflective assistant. Reply in a gentle, short paragraph.",
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
      systemInstruction:
        "You write a short diary entry. Return title, mood, 2-4 highlights, a short diary paragraph, and 2-6 tags.",
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
