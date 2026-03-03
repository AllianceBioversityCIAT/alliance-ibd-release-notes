import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const originalName = (file as File).name || "upload";
    const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const uuid = crypto.randomUUID().substring(0, 8);
    const fileName = `${date}_${uuid}_${originalName}`;

    const bucket = process.env.AWS_S3_BUCKET ?? "release-note-files";
    const region = process.env.AWS_REGION ?? "us-east-1";

    const buffer = Buffer.from(await file.arrayBuffer());

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: fileName,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    );

    const Location = `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`;
    return NextResponse.json({ Location });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
