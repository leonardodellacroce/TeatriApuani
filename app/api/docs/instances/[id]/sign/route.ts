import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: instanceId } = await params;

    // Verifica che l'istanza esista e sia in stato DRAFT
    const instance = await prisma.docInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    if (instance.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Instance is not in DRAFT status", status: instance.status },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      imageDataUrl,
      signedAtLocal,
      tz,
      tzOffsetMinutes,
      blockId,
      role,
    } = body;

    if (!imageDataUrl || !signedAtLocal || !tz || tzOffsetMinutes === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Estrai dati utente
    const userId = session.user.id!;
    const userAgent = req.headers.get("user-agent") || undefined;
    
    // Estrai IP
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : (req as any).ip ?? "unknown";

    // Calcola hash dell'IP se abbiamo un salt
    let ipHash: string | undefined;
    if (process.env.IP_SALT && ip !== "unknown") {
      ipHash = createHash("sha256")
        .update(ip + process.env.IP_SALT)
        .digest("hex");
    }

    // Estrai i dati base64 dell'immagine
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Calcola hash della firma
    const signatureHash = createHash("sha256")
      .update(base64Data)
      .digest("hex");

    // Salva l'immagine
    const timestamp = Date.now();
    const filename = `${instanceId}-${timestamp}.png`;
    const uploadsDir = join(process.cwd(), "public", "signatures");
    
    // Crea la directory se non esiste
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (err) {
      // Directory già esistente, ignora
    }

    const filepath = join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    const signaturePngUrl = `/signatures/${filename}`;

    // Crea il record SignEvent
    const signEvent = await prisma.signEvent.create({
      data: {
        instanceId,
        templateId: instance.templateId,
        userId,
        signaturePngUrl,
        signatureHash,
        signedAtUtc: new Date(),
        signedAtLocal,
        tz,
        tzOffsetMinutes,
        userAgent,
        ipHash,
        blockId: blockId || null,
        role: role || null,
      },
    });

    // Carica il template per verificare quante firme sono richieste
    const template = await prisma.docTemplate.findUnique({
      where: { id: instance.templateId },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Parse blocksJson per contare i blocchi firma richiesti
    const pages = JSON.parse(template.blocksJson);
    const allBlocks: any[] = [];
    
    // Estrai tutti i blocchi da tutte le pagine
    if (Array.isArray(pages)) {
      for (const page of pages) {
        if (page.blocks && Array.isArray(page.blocks)) {
          allBlocks.push(...page.blocks);
        }
      }
    }

    const signatureBlocks = allBlocks.filter((b: any) => b.type === "signature");
    const requiredSignatures = signatureBlocks.length;

    // Conta quante firme abbiamo già
    const existingSignatures = await prisma.signEvent.count({
      where: { instanceId },
    });

    // Determina il nuovo stato
    let newStatus = "DRAFT";
    if (requiredSignatures > 0 && existingSignatures >= requiredSignatures) {
      newStatus = "SIGNED";
      
      // Aggiorna l'istanza
      await prisma.docInstance.update({
        where: { id: instanceId },
        data: {
          status: "SIGNED",
          signedAt: new Date(),
          signedBy: session.user.email || session.user.name || userId,
        },
      });
    } else if (requiredSignatures === 0 && existingSignatures >= 1) {
      // Se non ci sono blocchi firma definiti, considera firmato dopo la prima firma
      newStatus = "SIGNED";
      
      await prisma.docInstance.update({
        where: { id: instanceId },
        data: {
          status: "SIGNED",
          signedAt: new Date(),
          signedBy: session.user.email || session.user.name || userId,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status: newStatus,
      eventId: signEvent.id,
      signaturePngUrl,
      signatureHash,
      requiredSignatures,
      existingSignatures,
    });
  } catch (error) {
    console.error("Error signing document:", error);
    return NextResponse.json(
      { error: "Error signing document", details: String(error) },
      { status: 500 }
    );
  }
}

