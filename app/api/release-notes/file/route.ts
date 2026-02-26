import { NextRequest, NextResponse } from "next/server";
import { N8N_BASE_URL } from "@/app/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Rebuild FormData to forward to n8n — preserve original filename
    const n8nForm = new FormData();
    n8nForm.append("file", file, (file as File).name || "upload");

    const res = await fetch(`${N8N_BASE_URL}/release-note/file`, {
      method: "POST",
      body: n8nForm,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: text || `n8n responded with ${res.status}` },
        { status: res.status }
      );
    }

    const text = await res.text();

    // n8n respondToWebhook may return empty body, JSON, or plain text
    if (!text || text.trim().length === 0) {
      // n8n returned empty — the upload succeeded but respondToWebhook
      // isn't configured to return S3 data. Return success with no URL.
      return NextResponse.json({
        success: true,
        Location: "",
        message: "File uploaded but n8n did not return the S3 URL. Configure respondToWebhook to return the S3 upload result.",
      });
    }

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch {
      // If not JSON, treat as plain text URL
      return NextResponse.json({ Location: text.trim() });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
