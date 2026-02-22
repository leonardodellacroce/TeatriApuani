import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import crypto from "crypto";

function generateTempPassword(length = 12): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// GET /api/users
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const archived = searchParams.get("archived");
    const standard = searchParams.get("standard"); // "true" to return only standard users (not super/admin/responsabile)
    const companyIdFilter = searchParams.get("companyId");

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // SUPER_ADMIN, ADMIN e RESPONSABILE possono vedere la lista utenti
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Se è RESPONSABILE, filtra solo gli utenti della sua azienda
    let whereClause: any = {};
    
    if (session.user.role === "RESPONSABILE") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      
      if (!currentUser?.companyId) {
        // Se il responsabile non ha un'azienda associata, non può vedere nessun utente
        return NextResponse.json([]);
      }
      
      whereClause.companyId = currentUser.companyId;
    }
    
    // Filtra per archiviati
    if (archived === "true") {
      whereClause.isArchived = true;
    } else if (archived === "false") {
      whereClause.isArchived = false;
    } else {
      // Se standard=true (per selezionare utenti per nuovi turni), escludi archiviati e disattivati
      // Altrimenti (per visualizzare turni esistenti), includi tutti
      if (standard === "true") {
        whereClause.isArchived = false;
        whereClause.isActive = true;
      } else {
        // Di default mostra solo elementi non archiviati
        whereClause.isArchived = false;
      }
    }

    // Filtra per utenti standard
    if (standard === "true") {
      whereClause.OR = [
        {
          isSuperAdmin: false,
          isAdmin: false,
          isResponsabile: false,
        },
        {
          isWorker: true,
        },
      ];
    }

    // Filtra per companyId se passato (e se non sei RESPONSABILE che è già forzato sopra)
    if (companyIdFilter) {
      whereClause.companyId = companyIdFilter;
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        company: {
          select: {
            id: true,
            ragioneSociale: true,
          },
        },
      },
    });

    // Rimuovi password dalla risposta e aggiungi hasAssignments
    const usersWithoutPassword = await Promise.all(
      users.map(async ({ password, ...user }) => {
        // Verifica se l'utente ha Assignment associati tramite userId
        const assignmentsByUserId = await prisma.assignment.count({
          where: {
            userId: user.id,
          },
        });
        
        // Verifica se l'utente è presente nel campo assignedUsers (JSON)
        // Recupera tutti gli Assignment che hanno assignedUsers non null
        const assignmentsWithAssignedUsers = await prisma.assignment.findMany({
          where: {
            assignedUsers: {
              not: null,
            },
          },
          select: {
            assignedUsers: true,
          },
        });
        
        // Conta quanti Assignment contengono questo utente in assignedUsers
        let assignmentsByAssignedUsers = 0;
        for (const assignment of assignmentsWithAssignedUsers) {
          if (assignment.assignedUsers) {
            try {
              const parsed = JSON.parse(assignment.assignedUsers);
              if (Array.isArray(parsed)) {
                // Verifica se l'utente è presente nell'array
                const userFound = parsed.some((item: any) => {
                  if (typeof item === 'string') {
                    return item === user.id;
                  } else if (item && typeof item === 'object' && item.userId) {
                    return item.userId === user.id;
                  }
                  return false;
                });
                if (userFound) {
                  assignmentsByAssignedUsers++;
                }
              }
            } catch {
              // Ignora errori di parsing JSON
            }
          }
        }
        
        const totalAssignments = assignmentsByUserId + assignmentsByAssignedUsers;
        
        return {
          ...user,
          hasAssignments: totalAssignments > 0,
          assignmentsCount: totalAssignments,
        };
      })
    );

    return NextResponse.json(usersWithoutPassword);
  } catch (error) {
    console.error("Error fetching users list:", error);
    return NextResponse.json({ error: "Error fetching users", details: String(error) }, { status: 500 });
  }
}

// POST /api/users
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    console.log("POST /api/users - Session:", session);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

  // SUPER_ADMIN, ADMIN e RESPONSABILE possono creare utenti
  const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

    const body = await req.json();
    console.log("Body received:", body);
    let { name, cognome, email, password, isSuperAdmin, isAdmin, isResponsabile, isCoordinatore, isWorker, codiceFiscale, companyId, areas, roles, mustChangePassword } = body;

    // Email obbligatoria; se la password non è fornita, genera temp e invia via email
    if (!email) {
      return NextResponse.json(
        { error: "Email è obbligatoria" },
        { status: 400 }
      );
    }

    const useCustomPassword = typeof password === "string" && password.trim().length > 0;
    const effectivePassword = useCustomPassword ? password : null;

    if (useCustomPassword && effectivePassword) {
      const { validatePassword } = await import("@/lib/passwordValidation");
      const validation = await validatePassword(effectivePassword);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const workerFlag = isWorker === true || isWorker === "true";

    // Se l'utente che crea è un RESPONSABILE, usa automaticamente il suo companyId
    if (session.user.role === "RESPONSABILE" && !isSuperAdmin && !isAdmin && !isResponsabile) {
      // Recupera il companyId del RESPONSABILE corrente
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      
      if (currentUser?.companyId) {
        companyId = currentUser.companyId;
        console.log("Auto-assigning companyId for RESPONSABILE:", companyId);
      } else {
        return NextResponse.json(
          { error: "Non sei associato ad un'azienda. Contatta l'amministratore." },
          { status: 400 }
        );
      }
    }

    // Se è SUPER_ADMIN, deve seguire la logica di gestione users
    if (isSuperAdmin || isAdmin || isResponsabile) {
      // Deve essere almeno super admin, admin o responsabile
      if (!isSuperAdmin && !isAdmin && !isResponsabile) {
        return NextResponse.json(
          { error: "L'utente deve essere almeno Super Admin, Admin o Responsabile" },
          { status: 400 }
        );
      }

      // Non può essere sia Super Admin che Admin
      if (isSuperAdmin && isAdmin) {
        return NextResponse.json(
          { error: "Non è possibile selezionare sia Super Admin che Admin" },
          { status: 400 }
        );
      }

      // Se è RESPONSABILE, deve avere un'azienda associata
      if (isResponsabile && !companyId) {
        return NextResponse.json(
          { error: "Il responsabile azienda deve essere associato ad un'azienda" },
          { status: 400 }
        );
      }
    }

    // Per utenti normali, verifica che non sia SUPER_ADMIN o ADMIN a creare utenti di gestione
    if (!isSuperAdmin && !isAdmin && !isResponsabile && session.user.role !== "SUPER_ADMIN") {
      // Verifica che sia ADMIN o RESPONSABILE
      if (!["ADMIN", "RESPONSABILE"].includes(session.user.role)) {
        return NextResponse.json(
          { error: "Non autorizzato a creare utenti" },
          { status: 403 }
        );
      }
    }

    // Verifica che l'email non esista già
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email già registrata" },
        { status: 400 }
      );
    }

    // Verifica che il codice fiscale non esista già
    if (codiceFiscale) {
      const existingCodiceFiscale = await prisma.user.findUnique({
        where: { codiceFiscale },
      });

      if (existingCodiceFiscale) {
        return NextResponse.json(
          { error: "Codice fiscale già esistente" },
          { status: 400 }
        );
      }
    }

    // Hash password: se non specificata, genera temp e invia via email
    let hashedPassword: string;
    let tempPasswordToSend: string | null = null;
    if (effectivePassword) {
      hashedPassword = await hash(effectivePassword, 10);
    } else {
      tempPasswordToSend = generateTempPassword();
      hashedPassword = await hash(tempPasswordToSend, 10);
    }

    // Calcola il prossimo codice progressivo basandoti sull'ultimo codice esistente
    // Evita collisioni quando ci sono cancellazioni/archiviazioni
    const lastByCode = await prisma.user.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const nextCodeNumber = lastByCode && /^[0-9]+$/.test(lastByCode.code)
      ? parseInt(lastByCode.code, 10) + 1
      : 1;
    const code = String(nextCodeNumber).padStart(3, '0');

    console.log("Creating user in database...");
    
    const userData: any = {
      code,
      name,
      cognome,
      email,
      password: hashedPassword,
      role: isSuperAdmin ? "SUPER_ADMIN" : isAdmin ? "ADMIN" : isResponsabile ? "RESPONSABILE" : null,
      isSuperAdmin,
      isAdmin: isSuperAdmin ? false : isAdmin,
      isResponsabile,
      isCoordinatore: body.isCoordinatore || false,
      isWorker: workerFlag,
      codiceFiscale,
      companyId: isSuperAdmin || isAdmin || isResponsabile ? (isResponsabile ? companyId : undefined) : companyId,
      areas: areas || null,
      roles: roles || null,
      lastPasswordChangeAt: effectivePassword ? new Date() : null,
    };

    if (tempPasswordToSend) {
      userData.mustChangePassword = true;
    }

    // Aggiungi mustChangePassword solo se il campo esiste nel database
    // (per retrocompatibilità prima della migrazione)
    if (mustChangePassword !== undefined && !tempPasswordToSend) {
      userData.mustChangePassword = mustChangePassword;
    }
    
    try {
      const user = await prisma.user.create({
        data: userData,
      });

      if (tempPasswordToSend) {
        const userName = [user.name, user.cognome].filter(Boolean).join(" ") || user.email || "Utente";
        const { subject, html, text } = passwordResetEmail({
          userName,
          tempPassword: tempPasswordToSend,
          isNewUser: true,
        });
        const sent = await sendEmail({ to: user.email, subject, html, text });
        if (!sent) {
          console.warn("[users] Email con password temporanea non inviata, ma utente creato");
        }
      }

      // Rimuovi password dalla risposta
      const { password: _, ...userWithoutPassword } = user;
      console.log("User created:", userWithoutPassword);
      return NextResponse.json(userWithoutPassword, { status: 201 });
    } catch (error: any) {
      // Se l'errore è dovuto al campo mustChangePassword che non esiste,
      // rimuovilo e riprova
      const errorMessage = String(error?.message || '').toLowerCase();
      if (errorMessage.includes('mustchangepassword') || 
          errorMessage.includes('unknown field') ||
          errorMessage.includes('unknown column')) {
        console.log("Campo mustChangePassword non disponibile nel database, creando utente senza il campo");
        delete userData.mustChangePassword;
        
        const user = await prisma.user.create({
          data: userData,
        });

        if (tempPasswordToSend) {
          const userName = [user.name, user.cognome].filter(Boolean).join(" ") || user.email || "Utente";
          const { subject, html, text } = passwordResetEmail({
            userName,
            tempPassword: tempPasswordToSend,
            isNewUser: true,
          });
          const sent = await sendEmail({ to: user.email, subject, html, text });
          if (!sent) {
            console.warn("[users] Email con password temporanea non inviata, ma utente creato");
          }
        }

        const { password: _, ...userWithoutPassword } = user;
        console.log("User created:", userWithoutPassword);
        return NextResponse.json(userWithoutPassword, { status: 201 });
      }
      throw error;
    }
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Error creating user", details: String(error) },
      { status: 500 }
    );
  }
}

