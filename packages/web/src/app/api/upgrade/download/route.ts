import { NextRequest, NextResponse } from "next/server";
import * as zip from "@zip.js/zip.js";
import { logger } from "@carapacesecurity/engine";

interface FileTransform {
  filePath: string;
  newContent: string;
}

interface DownloadRequest {
  projectName: string;
  transforms: FileTransform[];
  newFiles?: { path: string; content: string }[];
}

export async function POST(request: NextRequest) {
  try {
    const body: DownloadRequest = await request.json();
    const { projectName, transforms, newFiles } = body;

    if (!transforms?.length && !newFiles?.length) {
      return NextResponse.json(
        { error: "No files to download" },
        { status: 400 },
      );
    }

    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter);

    // Add transformed files
    for (const transform of transforms || []) {
      const content = new TextEncoder().encode(transform.newContent);
      await zipWriter.add(
        transform.filePath,
        new zip.Uint8ArrayReader(content),
      );
    }

    // Add new files
    for (const file of newFiles || []) {
      const content = new TextEncoder().encode(file.content);
      await zipWriter.add(file.path, new zip.Uint8ArrayReader(content));
    }

    await zipWriter.close();
    const blob = await blobWriter.getData();
    const buffer = await blob.arrayBuffer();

    const safeName = (projectName || "upgraded-project")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .slice(0, 50);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}-upgraded.zip"`,
      },
    });
  } catch (error: any) {
    logger.error(`Download error: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to generate download" },
      { status: 500 },
    );
  }
}
