import { transcribeWithWhisper } from "@/lib/whisper";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const audio = form.get("audio");
    const fallbackText = String(form.get("transcript") ?? "");
    const file = audio instanceof File ? audio : null;
    const result = await transcribeWithWhisper({
      audio: file ? await file.arrayBuffer() : undefined,
      filename: file?.name,
      mimeType: file?.type,
      fallbackText,
    });
    return Response.json(result);
  }

  const body = (await request.json()) as { transcript?: string };
  const result = await transcribeWithWhisper({ fallbackText: body.transcript });
  return Response.json(result);
}
