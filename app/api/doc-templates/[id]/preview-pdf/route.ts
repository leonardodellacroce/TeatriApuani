import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";
import { htmlToPdfBuffer, isServerless } from "@/lib/pdf";
import { renderTemplateHtml } from "@/lib/renderDocHtml";
import { writeFile } from "fs/promises";
import { join } from "path";

// POST /api/doc-templates/[id]/preview-pdf
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const mockData = body.data || {};

    // Carica il template
    const template = await prisma.docTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Parse template JSON (blocksJson contiene l'array pages come in DocTemplateJson)
    const templateJson = {
      title: template.title,
      pageSettings: JSON.parse(template.pageSettings),
      pages: JSON.parse(template.blocksJson),
    };

    // Ottieni origin
    const origin = req.headers.get("origin") || process.env.APP_ORIGIN || "http://localhost:3001";

    // Genera HTML
    const html = renderTemplateHtml(templateJson, mockData);

    // Genera PDF
    const pdfBuffer = await htmlToPdfBuffer(html, origin);

    // In ambiente locale, salva in public/exports
    if (!isServerless()) {
      const timestamp = Date.now();
      const filename = `preview-${id}-${timestamp}.pdf`;
      const filepath = join(process.cwd(), "public", "exports", filename);
      
      await writeFile(filepath, pdfBuffer);
      
      const pdfUrl = `/exports/${filename}`;
      return NextResponse.json({ pdfUrl });
    }

    // In serverless, ritorna il PDF direttamente
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${id}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating preview PDF:", error);
    return NextResponse.json(
      { error: "Error generating PDF", details: String(error) },
      { status: 500 }
    );
  }
}

