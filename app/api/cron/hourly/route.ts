import { NextRequest, NextResponse } from "next/server";
import { getNotificationTypeSetting } from "@/lib/notifications";
import { runNotifyShiftChanges } from "@/lib/notifyShiftChanges";

// GET /api/cron/hourly
// Chiamato da Vercel Cron ogni ora (0 * * * *)
// Verifica gli orari configurati per ogni tipo e invoca i cron corrispondenti quando l'ora corrente coincide.
// Rispetta cronHour (UTC) per MISSING_HOURS_REMINDER e DAILY_SHIFT_REMINDER.
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = req.headers.get("authorization");
    const secretParam = req.nextUrl.searchParams.get("secret")?.trim();
    const valid =
      cronSecret &&
      (authHeader === `Bearer ${cronSecret}` || secretParam === cronSecret);
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const currentHourUtc = now.getUTCHours();

    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const headers: HeadersInit = cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {};

    const results: Record<string, { invoked: boolean; reason?: string }> = {};

    // MISSING_HOURS_REMINDER
    const missingSetting = await getNotificationTypeSetting("MISSING_HOURS_REMINDER");
    const missingCronHour = (missingSetting?.metadata as { cronHour?: number })?.cronHour ?? 7;
    if (missingSetting?.isActive && currentHourUtc === missingCronHour) {
      try {
        const res = await fetch(`${baseUrl}/api/cron/notify-missing-hours`, { headers });
        results.MISSING_HOURS_REMINDER = { invoked: true };
        if (!res.ok) {
          results.MISSING_HOURS_REMINDER.reason = `HTTP ${res.status}`;
        }
      } catch (e) {
        results.MISSING_HOURS_REMINDER = { invoked: true, reason: String(e) };
      }
    } else {
      results.MISSING_HOURS_REMINDER = {
        invoked: false,
        reason: !missingSetting?.isActive
          ? "disabled"
          : `hour ${currentHourUtc} !== ${missingCronHour}`,
      };
    }

    // DAILY_SHIFT_REMINDER
    const dailySetting = await getNotificationTypeSetting("DAILY_SHIFT_REMINDER");
    const dailyCronHour = (dailySetting?.metadata as { cronHour?: number })?.cronHour ?? 7;
    if (dailySetting?.isActive && currentHourUtc === dailyCronHour) {
      try {
        const res = await fetch(`${baseUrl}/api/cron/notify-daily-shift-reminder`, {
          headers,
        });
        results.DAILY_SHIFT_REMINDER = { invoked: true };
        if (!res.ok) {
          results.DAILY_SHIFT_REMINDER.reason = `HTTP ${res.status}`;
        }
      } catch (e) {
        results.DAILY_SHIFT_REMINDER = { invoked: true, reason: String(e) };
      }
    } else {
      results.DAILY_SHIFT_REMINDER = {
        invoked: false,
        reason: !dailySetting?.isActive
          ? "disabled"
          : `hour ${currentHourUtc} !== ${dailyCronHour}`,
      };
    }

    // WORKDAY_ISSUES
    const workdaySetting = await getNotificationTypeSetting("WORKDAY_ISSUES");
    const workdayCronHour = (workdaySetting?.metadata as { cronHour?: number })?.cronHour ?? 8;
    if (workdaySetting?.isActive && currentHourUtc === workdayCronHour) {
      try {
        const res = await fetch(`${baseUrl}/api/cron/notify-workday-issues`, { headers });
        results.WORKDAY_ISSUES = { invoked: true };
        if (!res.ok) {
          results.WORKDAY_ISSUES.reason = `HTTP ${res.status}`;
        }
      } catch (e) {
        results.WORKDAY_ISSUES = { invoked: true, reason: String(e) };
      }
    } else {
      results.WORKDAY_ISSUES = {
        invoked: false,
        reason: !workdaySetting?.isActive
          ? "disabled"
          : `hour ${currentHourUtc} !== ${workdayCronHour}`,
      };
    }

    // SHIFT_CHANGES_REMINDER (due orari configurabili)
    const shiftChangesSetting = await getNotificationTypeSetting("SHIFT_CHANGES_REMINDER");
    if (shiftChangesSetting) {
      const meta = (shiftChangesSetting.metadata as {
        cronHour1?: number;
        cronHour2?: number;
      }) ?? {};
      const shiftHours = [
        meta.cronHour1 ?? 7,
        meta.cronHour2 ?? 19,
      ].filter((h) => h >= 0 && h <= 23);
      const shiftHourMatches = shiftHours.some((h) => h === currentHourUtc);
      if (shiftChangesSetting.isActive && shiftHourMatches) {
        try {
          const result = await runNotifyShiftChanges();
          results.SHIFT_CHANGES_REMINDER = {
            invoked: true,
            ...(result.usersNotified > 0 && { notified: result.usersNotified }),
          };
        } catch (e) {
          results.SHIFT_CHANGES_REMINDER = { invoked: true, reason: String(e) };
        }
      } else {
        results.SHIFT_CHANGES_REMINDER = {
          invoked: false,
          reason: !shiftChangesSetting.isActive
            ? "disabled"
            : `hour ${currentHourUtc} not in [${shiftHours.join(", ")}]`,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      currentHourUtc,
      results,
    });
  } catch (error) {
    console.error("Cron hourly error:", error);
    return NextResponse.json(
      { error: "Cron failed", details: String(error) },
      { status: 500 }
    );
  }
}
