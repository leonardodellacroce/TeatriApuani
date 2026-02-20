/**
 * Valuta espressioni sicure tipo {{data.field}} o {{formatDate(data.date)}}
 * senza usare eval
 */

export function evaluateExpression(expr: string, ctx: any): string {
  try {
    // Rimuovi spazi bianchi
    const cleaned = expr.trim();
    
    // Supporta funzioni helper
    const helpers = {
      formatDate: (iso: string) => {
        if (!iso) return "";
        try {
          const date = new Date(iso);
          const day = String(date.getDate()).padStart(2, "0");
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        } catch {
          return iso;
        }
      },
      formatDateTime: (iso: string) => {
        if (!iso) return "";
        try {
          const date = new Date(iso);
          const day = String(date.getDate()).padStart(2, "0");
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const year = date.getFullYear();
          const hours = String(date.getHours()).padStart(2, "0");
          const minutes = String(date.getMinutes()).padStart(2, "0");
          return `${day}/${month}/${year} ${hours}:${minutes}`;
        } catch {
          return iso;
        }
      },
      formatTime: (iso: string) => {
        if (!iso) return "";
        try {
          const date = new Date(iso);
          const hours = String(date.getHours()).padStart(2, "0");
          const minutes = String(date.getMinutes()).padStart(2, "0");
          return `${hours}:${minutes}`;
        } catch {
          return iso;
        }
      },
    };

    // Controlla se è una chiamata di funzione
    const funcMatch = cleaned.match(/^(\w+)\((.*)\)$/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const argExpr = funcMatch[2];
      
      if (funcName in helpers) {
        // Valuta l'argomento (ricorsivamente)
        const argValue = evaluateExpression(argExpr, ctx);
        return (helpers as any)[funcName](argValue);
      }
    }

    // Altrimenti è una dot notation: data.field.subfield
    const parts = cleaned.split(".");
    let result: any = ctx;
    
    for (const part of parts) {
      if (result && typeof result === "object" && part in result) {
        result = result[part];
      } else {
        return ""; // Campo non trovato
      }
    }

    return result != null ? String(result) : "";
  } catch {
    return "";
  }
}

/**
 * Sostituisce tutte le occorrenze {{expr}} in un testo
 */
export function replaceExpressions(text: string, ctx: any): string {
  return text.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
    return evaluateExpression(expr, ctx);
  });
}

