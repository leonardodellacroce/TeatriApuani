export type PageOrientation = "portrait" | "landscape";

export type PageSettings = {
  size: "A4";
  orientation: PageOrientation;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  showPageNumbers: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  headerHeight?: number; // Altezza intestazione in mm (default 5mm)
  footerHeight?: number; // Altezza piè di pagina in mm (default 5mm)
  headerContent?: string; // Contenuto intestazione
  footerContent?: string; // Contenuto piè di pagina
  headerFontFamily?: string; // Tipo di font intestazione
  headerFontSize?: number; // Dimensione font intestazione (pt)
  headerBold?: boolean;
  headerItalic?: boolean;
  headerAlign?: "left" | "center" | "right";
  headerVerticalAlign?: "top" | "middle" | "bottom";
  footerFontFamily?: string; // Tipo di font piè di pagina
  footerFontSize?: number; // Dimensione font piè di pagina (pt)
  footerBold?: boolean;
  footerItalic?: boolean;
  footerAlign?: "left" | "center" | "right";
  footerVerticalAlign?: "top" | "middle" | "bottom";
  grid?: {
    show: boolean;
    snap: boolean;
    stepMm: number;
  };
};

export type BlockType =
  | "header"
  | "title"
  | "paragraph"
  | "text"
  | "number"
  | "dateTime"
  | "checkbox"
  | "select"
  | "table"
  | "repeaterTable"
  | "group"
  | "signature"
  | "image"
  | "divider"
  | "spacer"
  | "dynamicText"
  | "pageBreak";

export type BlockStyle = {
  fontFamily?: string;
  fontSize?: number; // pt
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "middle" | "bottom";
  border?: "none" | "thin" | "medium";
  paddingMm?: number;
};

export type BlockBase = {
  id: string;
  type: BlockType;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm?: number;
  z?: number;
  locked?: boolean;
  visibleIf?: string | null;
  style?: BlockStyle;
  label?: string;
};

export type TableColumn = {
  id: string;
  header: string;
  widthFr: number;
  type: "text" | "number" | "dateTime" | "checkbox" | "signature";
  required?: boolean;
};

export type HeaderBlock = BlockBase & {
  type: "header";
  content?: string;
  logoUrl?: string | null;
};

export type TitleBlock = BlockBase & {
  type: "title";
  text: string;
  level: "h1" | "h2" | "h3";
};

export type ParagraphBlock = BlockBase & {
  type: "paragraph";
  html: string;
};

export type TextBlock = BlockBase & {
  type: "text";
  label: string;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
  bind?: string | null;
};

export type NumberBlock = BlockBase & {
  type: "number";
  label: string;
  required?: boolean;
  bind?: string | null;
};

export type DateTimeBlock = BlockBase & {
  type: "dateTime";
  label: string;
  mode: "date" | "time" | "datetime";
  bind?: string | null;
};

export type CheckboxBlock = BlockBase & {
  type: "checkbox";
  label: string;
  bind?: string | null;
};

export type SelectBlock = BlockBase & {
  type: "select";
  label: string;
  options: string[];
  bind?: string | null;
};

export type TableBlock = BlockBase & {
  type: "table";
  label?: string;
  columns: TableColumn[];
  rows: number;
};

export type RepeaterTableBlock = BlockBase & {
  type: "repeaterTable";
  label?: string;
  columns: TableColumn[];
  minRows?: number;
  maxRows?: number;
};

export type GroupBlock = BlockBase & {
  type: "group";
  title?: string;
};

export type SignatureBlock = BlockBase & {
  type: "signature";
  label: string;
  role?: string;
};

export type ImageBlock = BlockBase & {
  type: "image";
  imageUrl?: string | null;
  altText?: string;
};

export type DividerBlock = BlockBase & {
  type: "divider";
};

export type SpacerBlock = BlockBase & {
  type: "spacer";
};

export type DynamicTextBlock = BlockBase & {
  type: "dynamicText";
  expression: string;
};

export type PageBreakBlock = BlockBase & {
  type: "pageBreak";
};

export type Block =
  | HeaderBlock
  | TitleBlock
  | ParagraphBlock
  | TextBlock
  | NumberBlock
  | DateTimeBlock
  | CheckboxBlock
  | SelectBlock
  | TableBlock
  | RepeaterTableBlock
  | GroupBlock
  | SignatureBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | DynamicTextBlock
  | PageBreakBlock;

export type Page = {
  id: string;
  blocks: Block[];
};

export type DocTemplateJson = {
  title: string;
  pageSettings: PageSettings;
  pages: Page[];
};
