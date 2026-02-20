import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

// GET /api/users/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log("GET /api/users/[id] invoked");
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // SUPER_ADMIN, ADMIN e RESPONSABILE possono vedere i dati utente
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    
    // Se è RESPONSABILE, verifica che l'utente appartenga alla sua azienda
    if (session.user.role === "RESPONSABILE") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      
      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: { companyId: true },
      });
      
      if (currentUser?.companyId !== targetUser?.companyId) {
        return NextResponse.json({ error: "Forbidden - Puoi vedere solo gli utenti della tua azienda" }, { status: 403 });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        cognome: true,
        email: true,
        role: true,
        isAdmin: true,
        isSuperAdmin: true,
        isResponsabile: true,
        isActive: true,
        isArchived: true,
        isWorker: true,
        codiceFiscale: true,
        areas: true,
        roles: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            ragioneSociale: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Error fetching user", details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/users/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // SUPER_ADMIN, ADMIN e RESPONSABILE possono modificare gli utenti normali
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    
    // Se è RESPONSABILE, verifica che l'utente appartenga alla sua azienda
    if (session.user.role === "RESPONSABILE") {
      const loggedInUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      
      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: { companyId: true },
      });
      
      if (loggedInUser?.companyId !== targetUser?.companyId) {
        return NextResponse.json({ error: "Forbidden - Puoi modificare solo gli utenti della tua azienda" }, { status: 403 });
      }
    }
    
    const body = await req.json();
    
    console.log("PATCH /api/users/[id] - Body received:", body);
    
    // Recupera l'utente corrente per verificare i ruoli
    const currentUser = await prisma.user.findUnique({
      where: { id },
    });
    
    console.log("Current user:", currentUser);

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prepara i dati per l'aggiornamento
    const updateData: any = {
      name: body.name,
      cognome: body.cognome,
      codiceFiscale: body.codiceFiscale,
    };
    
    // Gestisci mustChangePassword
    if (body.mustChangePassword !== undefined) {
      updateData.mustChangePassword = body.mustChangePassword;
    }
    
    // Gestisci companyId - aggiorna solo se è diverso dall'attuale
    if (body.companyId !== undefined && body.companyId !== null) {
      if (body.companyId !== currentUser.companyId) {
        updateData.companyId = body.companyId;
      }
    } else if (body.companyId === null && currentUser.companyId !== null) {
      // Se viene esplicitamente impostato a null, aggiorna
      updateData.companyId = null;
    }
    
    // Gestisci aree e ruoli
    if (body.areas !== undefined) {
      updateData.areas = body.areas;
    }
    if (body.roles !== undefined) {
      updateData.roles = body.roles;
    }
    
    // Non importiamo i campi di gestione qui - li gestiremo solo quando necessario

    // Se l'email è diversa, aggiorna anche quella
    if (body.email && body.email !== currentUser.email) {
      // Verifica che la nuova email non esista già
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser && existingUser.id !== id) {
        return NextResponse.json(
          { error: "Email già in uso da altro utente" },
          { status: 400 }
        );
      }

      updateData.email = body.email;
    }

    // Solo SUPER_ADMIN può modificare la password e i campi di gestione per utenti di gestione
    if (session.user.role === "SUPER_ADMIN" && (currentUser.isSuperAdmin || currentUser.isAdmin || currentUser.isResponsabile)) {
      // Mantieni il companyId attuale se non viene fornito (utenti di gestione non hanno azienda)
      if (!body.companyId && currentUser.companyId === null) {
        updateData.companyId = null;
      }
      // Se la password è stata fornita e non è vuota, aggiornala
      if (body.password && body.password.length > 0) {
        if (body.password.length < 8) {
          return NextResponse.json(
            { error: "La password deve essere di almeno 8 caratteri" },
            { status: 400 }
          );
        }
        const hashedPassword = await hash(body.password, 10);
        updateData.password = hashedPassword;
      }

      // Inizializza i campi di gestione con i valori correnti
      updateData.isSuperAdmin = currentUser.isSuperAdmin;
      updateData.isAdmin = currentUser.isAdmin;
      updateData.isResponsabile = currentUser.isResponsabile;
      
      // Aggiorna solo se sono stati modificati
      if (body.isSuperAdmin !== undefined && body.isSuperAdmin !== currentUser.isSuperAdmin) {
        updateData.isSuperAdmin = body.isSuperAdmin;
      }
      if (body.isAdmin !== undefined && body.isAdmin !== currentUser.isAdmin) {
        updateData.isAdmin = body.isAdmin;
      }
      if (body.isResponsabile !== undefined && body.isResponsabile !== currentUser.isResponsabile) {
        updateData.isResponsabile = body.isResponsabile;
      }

      // Aggiorna il ruolo solo se almeno uno dei campi è stato modificato
      if ((body.isSuperAdmin !== undefined && body.isSuperAdmin !== currentUser.isSuperAdmin) ||
          (body.isAdmin !== undefined && body.isAdmin !== currentUser.isAdmin) ||
          (body.isResponsabile !== undefined && body.isResponsabile !== currentUser.isResponsabile)) {
        
        // Determina il ruolo in base ai valori finali
        if (updateData.isSuperAdmin) {
          updateData.role = "SUPER_ADMIN";
        } else if (updateData.isAdmin) {
          updateData.role = "ADMIN";
        } else if (updateData.isResponsabile) {
          updateData.role = "RESPONSABILE";
        }
      } else {
        // Nessun campo di gestione è stato modificato, mantieni il ruolo attuale
        updateData.role = currentUser.role;
      }
    }

    // Se è SUPER_ADMIN e sta modificando un utente normale, può modificare anche la password
    if (session.user.role === "SUPER_ADMIN" && !currentUser.isSuperAdmin && !currentUser.isAdmin && !currentUser.isResponsabile) {
      if (body.password && body.password.length > 0) {
        if (body.password.length < 8) {
          return NextResponse.json(
            { error: "La password deve essere di almeno 8 caratteri" },
            { status: 400 }
          );
        }
        const hashedPassword = await hash(body.password, 10);
        updateData.password = hashedPassword;
      }
    }

    // Gestisci isWorker
    if (body.isWorker !== undefined) {
      updateData.isWorker = body.isWorker === true || body.isWorker === "true";
    }

    console.log("Update data:", updateData);
    
    try {
      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        include: {
          company: true,
        },
      });

      const { password: _, ...userWithoutPassword } = user;
      return NextResponse.json(userWithoutPassword);
    } catch (error: any) {
      // Se l'errore è dovuto al campo mustChangePassword che non esiste nel database,
      // rimuovilo e riprova (per retrocompatibilità prima della migrazione)
      const errorMessage = String(error?.message || '').toLowerCase();
      const errorCode = error?.code || '';
      
      if (errorMessage.includes('mustchangepassword') || 
          errorMessage.includes('unknown field') ||
          errorMessage.includes('unknown column') ||
          errorCode === 'P2002' ||
          errorCode === 'P2011') {
        console.log("Campo mustChangePassword non disponibile nel database, rimuovendo dall'update");
        const updateDataWithoutFlag = { ...updateData };
        delete updateDataWithoutFlag.mustChangePassword;
        
        try {
          const user = await prisma.user.update({
            where: { id },
            data: updateDataWithoutFlag,
            include: {
              company: true,
            },
          });

          const { password: _, ...userWithoutPassword } = user;
          return NextResponse.json(userWithoutPassword);
        } catch (retryError) {
          console.error("Error updating user after removing mustChangePassword:", retryError);
          throw retryError;
        }
      }
      
      console.error("Error updating user:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Error updating user", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN e ADMIN possono eliminare utenti
    // RESPONSABILE può solo modificarli o disattivarli
    const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Non autorizzato ad eliminare utenti" }, { status: 403 });
    }

    const { id } = await params;

    // Verifica se l'utente ha Assignment associati tramite userId
    const assignmentsByUserId = await prisma.assignment.count({
      where: {
        userId: id,
      },
    });
    
    // Verifica se l'utente è presente nel campo assignedUsers (JSON)
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
                return item === id;
              } else if (item && typeof item === 'object' && item.userId) {
                return item.userId === id;
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

    if (totalAssignments > 0) {
      return NextResponse.json(
        { 
          error: "Impossibile eliminare l'utente. L'utente è associato a turni o giornate di lavoro. È possibile solo archiviare l'utente.",
          hasAssignments: true,
          assignmentsCount: totalAssignments
        },
        { status: 400 }
      );
    }

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Error deleting user", details: String(error) },
      { status: 500 }
    );
  }
}

