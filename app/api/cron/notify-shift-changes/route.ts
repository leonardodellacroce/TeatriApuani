import { NextRequest, NextResponse } from "next/server";
import { runNotifyShiftChanges } from "@/lib/notifyShiftChanges";

// GET /api/cron/notify-shift-changes
// Chiamato dall'hourly cron agli orari configurati (cronHour1, cronHour2) oppure manualmente.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runNotifyShiftChanges();
    return NextResponse.json({
      ok: result.ok,
      created: result.created,
      updated: result.updated,
      usersNotified: result.usersNotified,
      ...(result.skipped && { skipped: result.skipped }),
    });
  } catch (error) {
    console.error("Cron notify-shift-changes error:", error);
    return NextResponse.json(
      { error: "Cron failed", details: String(error) },
      { status: 500 }
    );
  }
}
