import * as XLSX from "xlsx";

/** Converte un nome in slug per il filename: minuscolo, senza spazi/accenti/caratteri speciali */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-|-$/g, "") || "report";
}

const formatHours = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

export function exportReportToExcel(
  reportData: any,
  reportType: string,
  formatHoursFn: (h: number) => string = formatHours
) {
  const period =
    reportData.startDate && reportData.endDate
      ? `${new Date(reportData.startDate).toLocaleDateString("it-IT")} - ${new Date(reportData.endDate).toLocaleDateString("it-IT")}`
      : new Date().toLocaleDateString("it-IT");

  let rows: unknown[][] = [];

  if (reportType === "cliente") {
    rows = [
      ["Report per Cliente"],
      ["Cliente", reportData.clientName || reportData.clientId || ""],
      ["Periodo", period],
      [],
    ];
    if (reportData.summaryByDuty?.length) {
      rows.push(["Riepilogo per Tipologia Turno"]);
      rows.push(["Codice", "Tipologia Turno", "Ore", "Turni Totali", "Straordinari"]);
      reportData.summaryByDuty.forEach((d: any) => {
        const totalShifts = d.shifts ?? 0;
        const hasShiftData = totalShifts > 0 || (d.overtimeHours ?? 0) > 0;
        rows.push([
          d.dutyCode || "-",
          d.dutyName,
          hasShiftData ? "0h 0m" : formatHoursFn(d.hours ?? 0),
          totalShifts,
          formatHoursFn(d.overtimeHours ?? 0),
        ]);
      });
      rows.push([]);
    }
    if (reportData.dailyDetails?.length) {
      rows.push(["Dettaglio Giornaliero"]);
      rows.push(["Data", "Location", "Evento", "Tipologia", "Orario", "Persone", "Ore/Turni", "Straordinari"]);
      reportData.dailyDetails.forEach((day: any) => {
        (day.taskTypes || day.duties || []).forEach((tt: any) => {
          (tt.shifts || []).forEach((s: any) => {
            const isShift = tt.isHourlyService === false;
            const oreTurni = isShift ? `${s.shifts ?? 0} turni` : formatHoursFn(s.totalHours ?? 0);
            rows.push([
              new Date(day.date).toLocaleDateString("it-IT"),
              day.locationName || "",
              day.eventTitle || "",
              tt.taskTypeName || tt.dutyName || "",
              `${s.startTime || "-"} - ${s.endTime || "-"}`,
              s.numberOfPeople ?? "",
              oreTurni,
              (s.overtimeHours ?? 0) > 0 ? formatHoursFn(s.overtimeHours) : "",
            ]);
          });
        });
      });
    }
  } else if (reportType === "evento") {
    rows = [
      ["Report per Evento"],
      ["Evento", reportData.eventTitle || ""],
      ["Location", reportData.locationName || ""],
      ["Periodo", period],
      [],
    ];
    if (reportData.summaryByDuty?.length) {
      rows.push(["Riepilogo per Tipologia Turno"]);
      rows.push(["Codice", "Tipologia Turno", "Ore", "Turni Totali", "Straordinari"]);
      reportData.summaryByDuty.forEach((d: any) => {
        const totalShifts = d.shifts ?? 0;
        const hasShiftData = totalShifts > 0 || (d.overtimeHours ?? 0) > 0;
        rows.push([
          d.dutyCode || "-",
          d.dutyName,
          hasShiftData ? "0h 0m" : formatHoursFn(d.hours ?? 0),
          totalShifts,
          formatHoursFn(d.overtimeHours ?? 0),
        ]);
      });
      rows.push([]);
    }
    if (reportData.dailyDetails?.length) {
      rows.push(["Dettaglio Giornaliero"]);
      rows.push(["Data", "Tipologia", "Orario", "Persone", "Ore/Turni", "Straordinari"]);
      reportData.dailyDetails.forEach((day: any) => {
        (day.taskTypes || []).forEach((tt: any) => {
          (tt.shifts || []).forEach((s: any) => {
            const isShift = tt.isHourlyService === false;
            const oreTurni = isShift ? `${s.shifts ?? 0} turni` : formatHoursFn(s.totalHours ?? 0);
            rows.push([
              new Date(day.date).toLocaleDateString("it-IT"),
              tt.taskTypeName || "",
              `${s.startTime || "-"} - ${s.endTime || "-"}`,
              s.numberOfPeople ?? "",
              oreTurni,
              (s.overtimeHours ?? 0) > 0 ? formatHoursFn(s.overtimeHours) : "",
            ]);
          });
        });
      });
    }
  } else if (reportType === "mansione") {
    rows = [
      ["Report per Mansione"],
      ["Mansione", `${reportData.dutyCode || ""} - ${reportData.dutyName || ""}`],
      ["Cliente", reportData.clientName || ""],
      ["Location", reportData.locationName || reportData.locationId || ""],
      ["Periodo", period],
      [],
    ];
    if (reportData.dailyDetails?.length) {
      rows.push(["Data", "Tipologia", "Ore/Turni", "Straordinari"]);
      reportData.dailyDetails.forEach((day: any) => {
        (day.taskTypes || []).forEach((tt: any) => {
          const isShift = tt.isHourlyService === false;
          const totalShifts = tt.shifts ?? 0;
          const totalOvertime = tt.overtimeHours ?? 0;
          const val = isShift
            ? `${totalShifts} turni${totalOvertime > 0 ? ` + ${formatHoursFn(totalOvertime)}` : ""}`
            : formatHoursFn(tt.totalHours ?? 0);
          rows.push([
            new Date(day.date).toLocaleDateString("it-IT"),
            tt.taskTypeName || "",
            val,
            totalOvertime > 0 && !isShift ? formatHoursFn(totalOvertime) : "",
          ]);
        });
      });
    }
  } else if (reportType === "azienda") {
    rows = [
      ["Report per Azienda"],
      ["Periodo", period],
      [],
    ];
    if (reportData.companies?.length) {
      rows.push(["Azienda", "Ore Totali", "Turni Totali", "Straordinari"]);
      reportData.companies.forEach((c: any) => {
        rows.push([
          c.companyName,
          formatHoursFn(c.totalHours ?? 0),
          c.totalShifts ?? 0,
          formatHoursFn(c.totalOvertimeHours ?? 0),
        ]);
      });
      rows.push([]);
    }
    const hasDetails = reportData.companies?.some((c: any) => c.dailyDetails?.length);
    if (hasDetails) {
      rows.push(["Dettaglio Giornaliero"]);
      rows.push(["Azienda", "Data", "Tipologia", "Orario", "Persone", "Ore/Turni", "Straordinari"]);
      reportData.companies.forEach((c: any) => {
        (c.dailyDetails || []).forEach((day: any) => {
          (day.taskTypes || []).forEach((tt: any) => {
            (tt.shifts || []).forEach((s: any) => {
              const isShift = tt.isHourlyService === false;
              const oreTurni = isShift ? `${s.shifts ?? 0} turni` : formatHoursFn(s.totalHours ?? 0);
              rows.push([
                c.companyName,
                new Date(day.date).toLocaleDateString("it-IT"),
                tt.taskTypeName || "",
                `${s.startTime || "-"} - ${s.endTime || "-"}`,
                s.numberOfPeople ?? "",
                oreTurni,
                (s.overtimeHours ?? 0) > 0 ? formatHoursFn(s.overtimeHours) : "",
              ]);
            });
          });
        });
      });
    }
  } else if (reportType === "dipendente") {
    rows = [
      ["Report per Dipendente"],
      ["Periodo", period],
      [],
    ];
    if (reportData.employees?.length) {
      rows.push(["Codice", "Nome", "Ore Totali", "Turni Totali", "Straordinari"]);
      reportData.employees.forEach((e: any) => {
        const hasOnlyShift = e.hasOnlyShiftServices === true;
        const ore = hasOnlyShift ? "0h 0m" : formatHoursFn(e.totalHours ?? 0);
        rows.push([e.userCode, e.userName, ore, e.totalShifts ?? 0, formatHoursFn(e.totalOvertimeHours ?? 0)]);
      });
      rows.push([]);
    }
    const hasEntries = reportData.employees?.some((e: any) => e.entries?.length);
    if (hasEntries) {
      rows.push(["Dettaglio Turni"]);
      rows.push(["Codice", "Nome", "Data", "Evento", "Orari", "Ore", "Turni", "Straordinari", "Note"]);
      reportData.employees.forEach((emp: any) => {
        (emp.entries || []).forEach((entry: any) => {
          const hasOnlyShift = emp.hasOnlyShiftServices === true;
          const ore = hasOnlyShift ? "-" : formatHoursFn(entry.hours ?? 0);
          const turni = entry.shifts != null ? `${entry.shifts}` : "-";
          rows.push([
            emp.userCode,
            emp.userName,
            new Date(entry.date).toLocaleDateString("it-IT"),
            entry.eventTitle || "",
            entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : "-",
            ore,
            turni,
            entry.overtimeHours != null ? formatHoursFn(entry.overtimeHours) : "",
            entry.notes || "",
          ]);
        });
      });
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Report");

  const typeLabel: Record<string, string> = {
    cliente: "cliente",
    evento: "evento",
    mansione: "mansione",
    azienda: "azienda",
    dipendente: "dipendente",
  };
  const label = typeLabel[reportType] || reportType;

  let entitySlug = "";
  if (reportType === "cliente") {
    entitySlug = slugify(reportData.clientName || reportData.clientId || "cliente");
  } else if (reportType === "evento") {
    entitySlug = slugify(reportData.eventTitle || "evento");
  } else if (reportType === "mansione") {
    entitySlug = slugify(`${reportData.dutyCode || ""} ${reportData.dutyName || ""}`.trim() || "mansione");
  } else if (reportType === "azienda") {
    const companies = reportData.companies || [];
    entitySlug = companies.length === 1 ? slugify(companies[0].companyName || "azienda") : "tutte";
  } else if (reportType === "dipendente") {
    const employees = reportData.employees || [];
    entitySlug = employees.length === 1 ? slugify(employees[0].userName || employees[0].userCode || "dipendente") : "tutti";
  }

  const periodFile = reportData.startDate && reportData.endDate
    ? `${new Date(reportData.startDate).toLocaleDateString("it-IT").replace(/\//g, "-")}_${new Date(reportData.endDate).toLocaleDateString("it-IT").replace(/\//g, "-")}`
    : new Date().toISOString().slice(0, 10);
  const filename = `report-${label}-${entitySlug}-${periodFile}.xlsx`;
  XLSX.writeFile(wb, filename);
}
