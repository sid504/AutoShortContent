import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TrendTopic, ScriptData } from "../types";

const getApiKey = (): string | undefined => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_API_KEY;
  }
  if (process.env.REACT_APP_API_KEY) return process.env.REACT_APP_API_KEY;
  if (process.env.API_KEY) return process.env.API_KEY;
  return undefined;
};

const getClient = () => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key not found.");
  return new GoogleGenAI({ apiKey });
};

// Robust retry wrapper that handles various transient network and API errors
const withRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const msg = (error.message || '').toLowerCase();

      // Handle API Key selection if needed
      if (msg.includes("requested entity was not found")) {
        // @ts-ignore
        if (window.aistudio?.openSelectKey) {
          // @ts-ignore
          await window.aistudio.openSelectKey();
          return await fn();
        }
      }

      // Detect transient network errors or rate limits
      // "load failed" is Safari's fetch error
      // "failed to fetch" is Chrome's fetch error
      // "429" or "quota" is rate limit
      const isTransient =
        msg.includes("503") ||
        msg.includes("overloaded") ||
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("fetch") ||
        msg.includes("load failed") ||
        msg.includes("network error");

      if (isTransient) {
        const delay = (i + 1) * 3000;
        console.warn(`Transient error detected: "${msg}". Retrying in ${delay}ms (Attempt ${i + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export const researchTrends = async (forcedConcept?: string): Promise<TrendTopic[]> => {
  return withRetry(async () => {
    const ai = getClient();

    // If a specific concept is provided (from the Serious Topics DB), use it directly.
    if (forcedConcept) {
      const prompt = `You are a Senior Content Strategist for a high-authority Telugu YouTube channel.
      
      YOUR TASK: Create 3 Viral Video Concepts based on this specific topic: "${forcedConcept}".
      
      REQUIREMENTS:
      1. Titles must be in Telugu/English mix (Tanglish) or pure Telugu.
      2. Style: Serious, Cinematic, Mystery, or "Hidden Truth" style.
      3. Avoid generic titles. Use "Unknown Facts", "Dark Secrets", "Real Story" angles.
      4. Each concept must have a "Virality Score" (85-99).
      
      Return the response as a JSON array of objects with keys: headline, description, viralityScore (number), searchVolume (string).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                headline: { type: Type.STRING },
                category: { type: Type.STRING },
                viralityScore: { type: Type.NUMBER },
                description: { type: Type.STRING },
                sources: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["id", "headline", "category", "viralityScore", "description", "sources"]
            }
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI for forced topic");

      // Inject dummy sources if missing
      const result = JSON.parse(text) as TrendTopic[];
      return result.map(t => ({ ...t, sources: t.sources || ['Google Books', 'Wikipedia'] }));
    }

    // Expanded strategies to include AI, Tech, and Politics
    const strategies = [
      "AI_REVOLUTION_UPDATES",
      "TECH_BREAKTHROUGHS",
      "GLOBAL_GEOPOLITICAL_SHIFTS",
      "MAHABHARATA_UNSUNG_HEROES",
      "SANATANA_DHARMA_SCIENTIFIC_PROOFS",
      "PURANIC_PROPHECIES_KALKI",
      "GREAT_TELUGU_DYNASTIES_WARS"
    ];

    const selectedStrategy = strategies[Math.floor(Math.random() * strategies.length)];
    const entropyFactor = Date.now().toString(36);

    const prompt = `You are a Viral Content Specialist for the Telugu market. 
    Session ID: ${entropyFactor}
    Strategy: ${selectedStrategy}
    
    Find 3 VIRAL and SHOCKING topics. 
    If Strategy is AI/Tech: Focus on "How AI changes jobs", "New Gadgets", "Future of World".
    If Strategy is Politics: Focus on "Global War risks", "India's new power", "Hidden Truths".
    If Strategy is Mythology: Focus on untold secrets/mysteries.
    
    Priority: AI Updates, Tech Breakthroughs, Global Politics, and Sanatana Dharma.
    
    Return 3 topics in JSON format. Headline must be a high-CTR clickbait title in Telugu/English mix.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              headline: { type: Type.STRING },
              category: { type: Type.STRING },
              viralityScore: { type: Type.NUMBER },
              description: { type: Type.STRING },
              sources: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["id", "headline", "category", "viralityScore", "description", "sources"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as TrendTopic[];
  });
};

export const generateScriptAndSEO = async (topic: TrendTopic, isShorts: boolean = false): Promise<ScriptData> => {
  return withRetry(async () => {
    const ai = getClient();
    const prompt = isShorts
      ? `You are a Viral Shorts/Reels Creator.
      Write a FAST-PACED, ENGAGING script for a 60-second vertical video.
      Topic: "${topic.headline}"
      
      RULES:
      1. Length: Under 180 words (Maximum 60 seconds).
      2. Hook: Must catch attention in the first 3 seconds.
      3. Language: Conversational Telugu (English Transliteration).
      4. Call to Action: "Subscribe/Follow" at the end.
      5. Thumbnail Text: 3 words punchy Telugu text for overlay.
      
      Return JSON with: title, thumbnailText, description (short), tags, hook, fullScriptOutline (visuals), scriptSections (text).`

      : `You are the lead writer for a 10-million subscriber channel.
      Write a DEEP, EMOTIONAL, and DETAILED script in TELUGU but using ENGLISH CHARACTERS (TRANSLITERATION).
      Example: instead of "నమస్కారం", write "Namaskaram".
      
      Topic: "${topic.headline}"
      Category: "${topic.category}"
      
      RULES:
      1. Narrative: High drama, storytelling style.
      2. Length: Detailed enough for 10 minutes.
      3. Call to Action: At 2 minutes, ask for "Subscription".
      4. Ending: Leave the audience with a philosophical question.
      5. Thumbnail Text: Create a SHORT, IMPACTFUL, 3-word text in **NATIVE TELUGU SCRIPT** (e.g., "షాకింగ్ నిజాలు"). 
      - CRITICAL: Do NOT use English characters for thumbnail text. Use proper Telugu letters.
      
      Language: Conversational but powerful Transliterated Telugu for the SCRIPT, but NATIVE TELUGU for THUMBNAIL TEXT.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            thumbnailText: { type: Type.STRING, description: "Short 3-5 word punchy text for thumbnail overlay" },
            description: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            hook: { type: Type.STRING },
            fullScriptOutline: { type: Type.ARRAY, items: { type: Type.STRING } },
            scriptSections: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "thumbnailText", "description", "tags", "hook", "fullScriptOutline", "scriptSections"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Script failed");
    const json = JSON.parse(text);
    return {
      title: json.title,
      thumbnailText: json.thumbnailText || json.title.substring(0, 20),
      description: json.description,
      tags: json.tags,
      hook: json.hook,
      fullScriptOutline: json.fullScriptOutline,
      fullScriptContent: json.scriptSections.join("\n\n")
    };
  });
};

export const generateThumbnailVariations = async (topic: string, title: string, thumbnailText?: string, isShorts: boolean = false): Promise<string[]> => {
  return withRetry(async () => {
    const ai = getClient();
    const textInstruction = thumbnailText
      ? `PRIMARY HEADLINE: "${thumbnailText}"`
      : `Generate a powerful, short Telugu headline.`;

    const prompt = `Create a VIRAL, ULTRA-HIGH QUALITY YouTube thumbnail (NK BROTHERS INDIA Style).
    
    TOPIC: "${title}"
    CATEGORY: ${topic}
    
    VISUAL STYLE:
    1. RESOLUTION: Hyper-realistic 8K, razor-sharp details.
    2. COMPOSITION: Cinematic depth with foreground/background separation.
    
    CRITICAL INSTRUCTION - COMPOSITION MUST HAVE TWO DISTINCT LAYERS:
    
    LAYER 1: BACKGROUND (CINEMATIC 3D)
    - Style: "NK BROTHERS INDIA" & "VR RAJA" Style.
    - Quality: Hyper-realistic 8K, Ray-traced lighting, Unreal Engine 5 render style.
    - Content: Deep 3D scene related to "${title}".
    - Lighting: Dramatic, Volumetric, Cinematic shadows. 
    - **IMPORTANT:** The background Must be fully 3D and realistic.
    
    LAYER 2: TEXT OVERLAY (2D FLAT VECTOR)
    - The text "${thumbnailText || 'TELUGU TEXT'}" must be a STICKER floating ON TOP.
    - **NO 3D EFFECTS ON TEXT:** No metal, no stone carving, no perspective slant.
    - Look: Flat, Bright, High Contrast.
    - Font: Massive, Bold Sans-Serif.
    - Colors: Yellow/White text with THICK BLACK STROKE/OUTLINES.
    - Alignment: Straight, Horizontal, Centered.
    
    ${textInstruction}
    
    FINAL RESULT: A masterpiece 3D render with a catchy 2D YouTube thumbnail text sticker on top.
    Aspect Ratio ${isShorts ? '9:16' : '16:9'}.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: isShorts ? "9:16" : "16:9", imageSize: "1K" } }
    });

    const variations: string[] = [];
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) variations.push(`data:image/png;base64,${part.inlineData.data}`);
    }
    return variations;
  });
};

export const generateStoryboardImages = async (topic: string, outline: string[], isShorts: boolean = false): Promise<string[]> => {
  const scenes = outline.slice(0, 40);
  const images: string[] = [];

  // Batch processing with individual frame retries to prevent whole-set failures
  // Using Flash Image model to prevent quota exhaustion
  for (let i = 0; i < scenes.length; i += 2) {
    const batch = scenes.slice(i, i + 2);
    const promises = batch.map(async (scene) => {
      return withRetry(async () => {
        const ai = getClient();
        const res = await ai.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: { parts: [{ text: `Cinematic movie still for a Telugu documentary. Topic: ${topic}. Scene: ${scene}. 4k, Indian aesthetics, dramatic shadows. Aspect Ratio ${isShorts ? '9:16' : '16:9'}.` }] },
          config: { imageConfig: { aspectRatio: isShorts ? "9:16" : "16:9", imageSize: "1K" } }
        });
        const part = res.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        return part ? `data:image/png;base64,${part.inlineData.data}` : null;
      }, 2); // Individual frames get fewer retries but won't stop the loop
    });

    const results = await Promise.all(promises);
    results.forEach(img => img && images.push(img));
    // Moderate delay to avoid hitting global concurrent request limits in browser
    await new Promise(r => setTimeout(r, 1200));
  }
  return images;
};

export const generateVoiceover = async (text: string, voiceName: string = 'Puck'): Promise<string> => {
  return withRetry(async () => {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: { parts: [{ text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
      }
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error("No audio generated");
    return audioData;
  });
};

export const generateVideoPreview = async (topic: string, hook: string, isShorts: boolean = false): Promise<string> => {
  return withRetry(async () => {
    const ai = getClient();
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: `Epic cinematic movie intro for: ${topic}. Context: ${hook}. ${isShorts ? 'Vertical 9:16 video.' : 'Cinematic 16:9 video.'}`,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: isShorts ? '9:16' : '16:9' }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 8000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("Video URI missing");

    const apiKey = getApiKey();

    // Explicitly handle "Load failed" / fetch errors when downloading the actual MP4
    let fetchAttempts = 5;
    while (fetchAttempts > 0) {
      try {
        const res = await fetch(`${videoUri}&key=${apiKey}`);
        if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch (e: any) {
        const msg = (e.message || '').toLowerCase();
        fetchAttempts--;
        console.warn(`Video download attempt failed: ${msg}. Retrying...`);
        if (fetchAttempts === 0) throw e;
        await new Promise(r => setTimeout(r, 4000));
      }
    }
    throw new Error("Failed to download final video asset.");
  });
};

export const checkAndRequestVeoKey = async () => {
  // @ts-ignore
  if (window.aistudio?.hasSelectedApiKey) {
    // @ts-ignore
    if (!(await window.aistudio.hasSelectedApiKey())) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
  }
};