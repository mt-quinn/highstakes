import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";

import type { Invention } from "@/lib/investTypes";

export function inventionImagesEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function inventionImagesCanPersist(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function generateAndStoreInventionImage(args: {
  seed: string;
  gameId: string;
  inventionId: string;
  invention: Invention;
}): Promise<string | undefined> {
  if (!inventionImagesEnabled()) return undefined;

  const model = process.env.GEMINI_IMAGE_MODEL_ID || "gemini-2.5-flash-image";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = buildInventionImagePrompt(args.invention);
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p: any) => p?.inlineData?.data) as any;
  const base64 = inline?.inlineData?.data as string | undefined;
  if (!base64) return undefined;

  // Local dev: no Blob token -> return data URL.
  if (!inventionImagesCanPersist()) {
    return `data:image/png;base64,${base64}`;
  }

  const blobPath = `inventions/${args.gameId}-${args.inventionId}.png`;
  const blob = await put(blobPath, Buffer.from(base64, "base64"), {
    access: "public",
    addRandomSuffix: false,
    contentType: "image/png",
  });

  return blob.url;
}

function buildInventionImagePrompt(inv: Invention): string {
  const [d1, d2] = inv.descriptors;
  return `Create a clean, readable illustration of a consumer product invention for a comedic investor pitch game.

Style:
- Clean illustration (not photoreal).
- High contrast, simple shapes, readable details.
- No text, no watermark, no logo, no frame, no border.
- Background: plain off-white (#F7F4EC) with a subtle soft shadow under the object.
- The invention should be centered and fill ~75% of the canvas.
- IMPORTANT: show ONLY the product/object. No people, no hands, no faces.

Invention:
- Title: ${inv.title}
- Pitch: ${inv.pitch}
- Descriptors to embody: ${d1}, ${d2}

Output: a single image.`.trim();
}


