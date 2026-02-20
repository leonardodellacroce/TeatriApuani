export type FieldType = "text" | "multiline" | "checkbox" | "signature" | "date" | "select";

export type Field = {
  id: string;
  page: number;             // 1-based: pagina del PDF
  type: FieldType;
  x: number; y: number;     // coordinate relative alla pagina (sistema bottom-left)
  w: number; h: number;
  label?: string;
  required?: boolean;
  options?: string[];       // per select
  group?: string;           // es. "gennaio","febbraio",...
  readonly?: boolean;       // true se bloccato (mese firmato)
};

export type TemplateSchema = {
  pdfPath: string;          // es. /storage/<id>.pdf
  pageDims: { [page: number]: { w: number; h: number } }; // dimensioni per OGNI pagina renderizzata
  fields: Field[];          // campi distribuiti su più pagine
};

