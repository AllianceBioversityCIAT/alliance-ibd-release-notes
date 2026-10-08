import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

/**
 * POST /api/release-notes/jira-to-s3
 * Downloads Jira attachment images and re-uploads them to S3.
 * Body: { urls: string[] }
 * Returns: { mappings: { [jiraUrl: string]: string } }
 */
export async function POST(req: NextRequest) {
  try {
    const { urls } = (await req.json()) as { urls: string[] };
    if (!urls?.length) return NextResponse.json({ mappings: {} });

    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;
    if (!email || !token) {
      return NextResponse.json({ error: "Jira credentials not configured" }, { status: 500 });
    }

    const jiraAuth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
    const bucket = process.env.S3_BUCKET ?? "release-note-files";
    const mappings: Record<string, string> = {};

    for (const jiraUrl of urls) {
      try {
        // Download from Jira
        const res = await fetch(jiraUrl, {
          headers: { Authorization: jiraAuth },
          redirect: "follow",
        });
        if (!res.ok) continue;

        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") || "image/png";

        // Build S3 key
        const originalName = decodeURIComponent(jiraUrl.split("/").pop() || "attachment.png");
        const safeName = originalName.replace(/[^\x20-\x7E]/g, "_").replace(/\s+/g, "_");
        const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
        const uuid = crypto.randomUUID().substring(0, 8);
        const fileName = `jira_${date}_${uuid}_${safeName}`;

        // Upload to S3
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: fileName,
            Body: buffer,
            ContentType: contentType,
          })
        );

        // Presigned URL valid for 7 days
        const s3Url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: fileName }),
          { expiresIn: 7 * 24 * 60 * 60 }
        );

        mappings[jiraUrl] = s3Url;
      } catch (err) {
        console.error(`Failed to convert Jira attachment to S3: ${jiraUrl}`, err);
      }
    }

    return NextResponse.json({ mappings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
