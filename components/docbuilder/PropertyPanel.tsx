"use client";

import { Block, TableColumn } from "./types";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";

interface PropertyPanelProps {
  selected?: Block;
  onChange: (patch: Partial<Block>) => void;
  onChangeSpecific: (b: Block) => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  isLandscape?: boolean;
}

export default function PropertyPanel({
  selected,
  onChange,
  onChangeSpecific,
  onDuplicate,
  onToggleLock,
  onBringToFront,
  onSendToBack,
  isLandscape = false,
}: PropertyPanelProps) {
  if (!selected) {
    return (
      <div className="text-xs text-gray-500">
        Seleziona un blocco per modificarne le proprietà
      </div>
    );
  }

  return (
    <div className={`text-sm ${isLandscape ? "grid grid-cols-2 gap-x-6 gap-y-4" : "space-y-4"}`}>
      {/* Azioni rapide */}
      <div className={`flex flex-wrap gap-2 ${isLandscape ? "col-span-2" : ""}`}>
        <button
          onClick={onDuplicate}
          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
          title="Duplica (Cmd+D)"
        >
          Duplica
        </button>
        <button
          onClick={onToggleLock}
          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
        >
          {selected.locked ? "Sblocca" : "Blocca"}
        </button>
        <button
          onClick={onBringToFront}
          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
          title="Porta davanti (Cmd+])"
        >
          ↑ Davanti
        </button>
        <button
          onClick={onSendToBack}
          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
          title="Manda dietro (Cmd+[)"
        >
          ↓ Dietro
        </button>
      </div>

      {/* Generali */}
      <Section title="Generali">
        <Field label="Tipo">
          <input
            type="text"
            value={selected.type}
            readOnly
            className="w-full px-2 py-1 text-xs bg-gray-50 border border-gray-300 rounded"
          />
        </Field>
        {selected.label !== undefined && (
          <Field label="Label">
            <input
              type="text"
              value={selected.label || ""}
              onChange={(e) => onChange({ label: e.target.value })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
        )}
      </Section>

      {/* Posizione e dimensioni */}
      <Section title="Posizione e Dimensioni (mm)">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <input
              type="number"
              value={selected.xMm}
              onChange={(e) => onChange({ xMm: Number(e.target.value) })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              step="0.1"
            />
          </Field>
          <Field label="Y">
            <input
              type="number"
              value={selected.yMm}
              onChange={(e) => onChange({ yMm: Number(e.target.value) })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              step="0.1"
            />
          </Field>
          <Field label="Larghezza">
            <input
              type="number"
              value={selected.wMm}
              onChange={(e) => onChange({ wMm: Number(e.target.value) })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              step="0.1"
              min="10"
            />
          </Field>
          {selected.hMm !== undefined && (
            <Field label="Altezza">
              <input
                type="number"
                value={selected.hMm}
                onChange={(e) => onChange({ hMm: Number(e.target.value) })}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                step="0.1"
                min="8"
              />
            </Field>
          )}
        </div>
      </Section>

      {/* Stile */}
      <Section title="Stile">
        <Field label="Font">
          <select
            value={selected.style?.fontFamily || "Arial"}
            onChange={(e) =>
              onChange({ style: { ...selected.style, fontFamily: e.target.value } })
            }
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          >
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
          </select>
        </Field>
        <Field label="Dimensione (pt)">
          <input
            type="number"
            value={(() => {
              // Per i titoli, mostra la dimensione determinata dal livello
              if (selected.type === "title") {
                const level = (selected as any).level || "h1";
                if (level === "h1") return 24;
                if (level === "h2") return 18;
                if (level === "h3") return 14;
              }
              return selected.style?.fontSize || 12;
            })()}
            onChange={(e) =>
              onChange({ style: { ...selected.style, fontSize: Number(e.target.value) } })
            }
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            min="6"
            max="72"
            disabled={selected.type === "title"}
            title={selected.type === "title" ? "La dimensione è determinata dal livello H1/H2/H3" : ""}
          />
        </Field>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.style?.bold || false}
              onChange={(e) =>
                onChange({ style: { ...selected.style, bold: e.target.checked } })
              }
              className="w-3 h-3"
            />
            <span className="text-xs">Grassetto</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.style?.italic || false}
              onChange={(e) =>
                onChange({ style: { ...selected.style, italic: e.target.checked } })
              }
              className="w-3 h-3"
            />
            <span className="text-xs">Corsivo</span>
          </label>
        </div>
        <Field label="Allineamento orizzontale">
          <select
            value={selected.style?.align || "left"}
            onChange={(e) =>
              onChange({ style: { ...selected.style, align: e.target.value as any } })
            }
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          >
            <option value="left">Sinistra</option>
            <option value="center">Centro</option>
            <option value="right">Destra</option>
            <option value="justify">Giustificato</option>
          </select>
        </Field>
        <Field label="Allineamento verticale">
          <select
            value={selected.style?.verticalAlign || "top"}
            onChange={(e) =>
              onChange({ style: { ...selected.style, verticalAlign: e.target.value as any } })
            }
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          >
            <option value="top">Alto</option>
            <option value="middle">Centro</option>
            <option value="bottom">Basso</option>
          </select>
        </Field>
        <Field label="Bordo">
          <select
            value={selected.style?.border || "none"}
            onChange={(e) =>
              onChange({ style: { ...selected.style, border: e.target.value as any } })
            }
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          >
            <option value="none">Nessuno</option>
            <option value="thin">Sottile</option>
            <option value="medium">Medio</option>
          </select>
        </Field>
        <Field label="Padding (mm)">
          <input
            type="number"
            value={selected.style?.paddingMm || 2}
            onChange={(e) =>
              onChange({ style: { ...selected.style, paddingMm: Number(e.target.value) } })
            }
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            min="0"
            step="0.5"
          />
        </Field>
      </Section>

      {/* Proprietà specifiche per tipo */}
      <TypeSpecificProperties block={selected} onChange={onChange} onChangeSpecific={onChangeSpecific} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-200 pt-3">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function TypeSpecificProperties({
  block,
  onChange,
  onChangeSpecific,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onChangeSpecific: (b: Block) => void;
}) {
  switch (block.type) {
    case "header":
      return (
        <Section title="Contenuto Header">
          <Field label="Testo">
            <textarea
              value={(block as any).content || ""}
              onChange={(e) => onChange({ content: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              rows={3}
            />
          </Field>
        </Section>
      );

    case "title":
      const handleTitleLevelChange = (level: string) => {
        const levelStyles = {
          h1: { fontSize: 24 },
          h2: { fontSize: 18 },
          h3: { fontSize: 14 },
        };
        
        const newStyle = levelStyles[level as keyof typeof levelStyles];
        onChange({ 
          level: level,
          style: {
            ...block.style,
            fontSize: newStyle.fontSize,
          }
        } as any);
      };

      return (
        <Section title="Contenuto Titolo">
          <Field label="Testo">
            <input
              type="text"
              value={(block as any).text || ""}
              onChange={(e) => onChange({ text: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          <Field label="Livello">
            <select
              value={(block as any).level || "h1"}
              onChange={(e) => handleTitleLevelChange(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            >
              <option value="h1">H1</option>
              <option value="h2">H2</option>
              <option value="h3">H3</option>
            </select>
          </Field>
        </Section>
      );

    case "paragraph":
      return <ParagraphEditor block={block as any} onChange={onChange} />;

    case "text":
      return (
        <Section title="Campo Testo">
          <Field label="Label">
            <input
              type="text"
              value={(block as any).label || ""}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          <Field label="Placeholder">
            <input
              type="text"
              value={(block as any).placeholder || ""}
              onChange={(e) => onChange({ placeholder: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          <Field label="Binding">
            <input
              type="text"
              value={(block as any).bind || ""}
              onChange={(e) => onChange({ bind: e.target.value || null } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="dataJson.fieldName"
            />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(block as any).multiline || false}
              onChange={(e) => onChange({ multiline: e.target.checked } as any)}
              className="w-3 h-3"
            />
            <span className="text-xs">Multilinea</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(block as any).required || false}
              onChange={(e) => onChange({ required: e.target.checked } as any)}
              className="w-3 h-3"
            />
            <span className="text-xs">Obbligatorio</span>
          </label>
        </Section>
      );

    case "number":
      return (
        <Section title="Campo Numero">
          <Field label="Label">
            <input
              type="text"
              value={(block as any).label || ""}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          <Field label="Binding">
            <input
              type="text"
              value={(block as any).bind || ""}
              onChange={(e) => onChange({ bind: e.target.value || null } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="dataJson.fieldName"
            />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(block as any).required || false}
              onChange={(e) => onChange({ required: e.target.checked } as any)}
              className="w-3 h-3"
            />
            <span className="text-xs">Obbligatorio</span>
          </label>
        </Section>
      );

    case "dateTime":
      return (
        <Section title="Campo Data/Ora">
          <Field label="Label">
            <input
              type="text"
              value={(block as any).label || ""}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          <Field label="Modalità">
            <select
              value={(block as any).mode || "date"}
              onChange={(e) => onChange({ mode: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            >
              <option value="date">Data</option>
              <option value="time">Ora</option>
              <option value="datetime">Data e Ora</option>
            </select>
          </Field>
          <Field label="Binding">
            <input
              type="text"
              value={(block as any).bind || ""}
              onChange={(e) => onChange({ bind: e.target.value || null } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="dataJson.fieldName"
            />
          </Field>
        </Section>
      );

    case "checkbox":
      return (
        <Section title="Campo Checkbox">
          <Field label="Label">
            <input
              type="text"
              value={(block as any).label || ""}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          <Field label="Binding">
            <input
              type="text"
              value={(block as any).bind || ""}
              onChange={(e) => onChange({ bind: e.target.value || null } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="dataJson.fieldName"
            />
          </Field>
        </Section>
      );

    case "select":
      return (
        <Section title="Campo Select">
          <Field label="Label">
            <input
              type="text"
              value={(block as any).label || ""}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          <Field label="Opzioni">
            <OptionsEditor
              options={(block as any).options || []}
              onChange={(opts) => onChange({ options: opts } as any)}
            />
          </Field>
          <Field label="Binding">
            <input
              type="text"
              value={(block as any).bind || ""}
              onChange={(e) => onChange({ bind: e.target.value || null } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="dataJson.fieldName"
            />
          </Field>
        </Section>
      );

    case "table":
    case "repeaterTable":
      return (
        <TableEditor
          block={block as any}
          onChange={onChange}
          onChangeSpecific={onChangeSpecific}
        />
      );

    case "group":
      return (
        <Section title="Gruppo">
          <Field label="Titolo">
            <input
              type="text"
              value={(block as any).title || ""}
              onChange={(e) => onChange({ title: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
        </Section>
      );

    case "signature":
      return (
        <Section title="Firma">
          <Field label="Label">
            <input
              type="text"
              value={(block as any).label || ""}
              onChange={(e) => onChange({ label: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          <Field label="Ruolo">
            <input
              type="text"
              value={(block as any).role || ""}
              onChange={(e) => onChange({ role: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="es: Responsabile"
            />
          </Field>
        </Section>
      );

    case "image":
      const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
          onChange({ imageUrl: reader.result as string } as any);
        };
        reader.readAsDataURL(file);
      };

      return (
        <Section title="Immagine">
          <Field label="Carica immagine">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </Field>
          {(block as any).imageUrl && (
            <Field label="Anteprima">
              <img 
                src={(block as any).imageUrl} 
                alt="Anteprima" 
                className="w-full h-32 object-contain border border-gray-300 rounded"
              />
              <button
                onClick={() => onChange({ imageUrl: null } as any)}
                className="mt-2 w-full px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Rimuovi immagine
              </button>
            </Field>
          )}
          <Field label="Testo alternativo">
            <input
              type="text"
              value={(block as any).altText || ""}
              onChange={(e) => onChange({ altText: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="Descrizione immagine"
            />
          </Field>
        </Section>
      );

    case "dynamicText":
      return (
        <Section title="Testo Dinamico">
          <Field label="Espressione">
            <input
              type="text"
              value={(block as any).expression || ""}
              onChange={(e) => onChange({ expression: e.target.value } as any)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              placeholder="dataJson.field"
            />
          </Field>
        </Section>
      );

    default:
      return null;
  }
}

function ParagraphEditor({ block, onChange }: { block: any; onChange: (patch: any) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Link],
    content: block.html || "",
    onUpdate: ({ editor }) => {
      onChange({ html: editor.getHTML() });
    },
  });

  useEffect(() => {
    if (editor && block.html !== editor.getHTML()) {
      editor.commands.setContent(block.html || "");
    }
  }, [block.html, editor]);

  return (
    <Section title="Contenuto Paragrafo">
      <div className="border border-gray-300 rounded">
        {/* Toolbar */}
        <div className="flex gap-1 p-1 border-b border-gray-300 bg-gray-50">
          <button
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`px-2 py-1 text-xs rounded ${
              editor?.isActive("bold") ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"
            }`}
          >
            B
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 text-xs rounded ${
              editor?.isActive("italic") ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"
            }`}
          >
            I
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 text-xs rounded ${
              editor?.isActive("bulletList") ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"
            }`}
          >
            •
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 text-xs rounded ${
              editor?.isActive("orderedList") ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"
            }`}
          >
            1.
          </button>
        </div>
        {/* Editor */}
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-2 min-h-[100px] text-xs"
        />
      </div>
    </Section>
  );
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  const addOption = () => {
    onChange([...options, ""]);
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    onChange(updated);
  };

  return (
    <div className="space-y-1">
      {options.map((opt, idx) => (
        <div key={idx} className="flex gap-1">
          <input
            type="text"
            value={opt}
            onChange={(e) => updateOption(idx, e.target.value)}
            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
            placeholder={`Opzione ${idx + 1}`}
          />
          <button
            onClick={() => removeOption(idx)}
            className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 rounded"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addOption}
        className="w-full px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
      >
        + Aggiungi opzione
      </button>
    </div>
  );
}

function TableEditor({
  block,
  onChange,
  onChangeSpecific,
}: {
  block: any;
  onChange: (patch: any) => void;
  onChangeSpecific: (b: Block) => void;
}) {
  const columns: TableColumn[] = block.columns || [];

  const addColumn = () => {
    const newCol: TableColumn = {
      id: crypto.randomUUID(),
      header: `Colonna ${columns.length + 1}`,
      widthFr: 1,
      type: "text",
      required: false,
    };
    onChangeSpecific({ ...block, columns: [...columns, newCol] });
  };

  const removeColumn = (id: string) => {
    onChangeSpecific({ ...block, columns: columns.filter((c) => c.id !== id) });
  };

  const updateColumn = (id: string, patch: Partial<TableColumn>) => {
    onChangeSpecific({
      ...block,
      columns: columns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const newCols = [...columns];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newCols.length) return;
    [newCols[index], newCols[targetIndex]] = [newCols[targetIndex], newCols[index]];
    onChangeSpecific({ ...block, columns: newCols });
  };

  return (
    <Section title={block.type === "table" ? "Tabella" : "Tabella Ripetibile"}>
      {block.label !== undefined && (
        <Field label="Label">
          <input
            type="text"
            value={block.label || ""}
            onChange={(e) => onChange({ label: e.target.value })}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          />
        </Field>
      )}

      {block.type === "table" && (
        <Field label="Righe">
          <input
            type="number"
            value={block.rows || 3}
            onChange={(e) => onChange({ rows: Number(e.target.value) })}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            min="1"
          />
        </Field>
      )}

      {block.type === "repeaterTable" && (
        <>
          <Field label="Righe minime">
            <input
              type="number"
              value={block.minRows || 1}
              onChange={(e) => onChange({ minRows: Number(e.target.value) })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              min="0"
            />
          </Field>
          <Field label="Righe massime">
            <input
              type="number"
              value={block.maxRows || 10}
              onChange={(e) => onChange({ maxRows: Number(e.target.value) })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              min="1"
            />
          </Field>
        </>
      )}

      <div className="border-t border-gray-200 pt-2 mt-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700">Colonne</span>
          <button
            onClick={addColumn}
            className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 rounded"
          >
            + Colonna
          </button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {columns.map((col, idx) => (
            <div key={col.id} className="border border-gray-300 rounded p-2 space-y-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">Colonna {idx + 1}</span>
                <div className="flex gap-1">
                  {idx > 0 && (
                    <button
                      onClick={() => moveColumn(idx, "up")}
                      className="px-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      title="Sposta su"
                    >
                      ↑
                    </button>
                  )}
                  {idx < columns.length - 1 && (
                    <button
                      onClick={() => moveColumn(idx, "down")}
                      className="px-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      title="Sposta giù"
                    >
                      ↓
                    </button>
                  )}
                  <button
                    onClick={() => removeColumn(col.id)}
                    className="px-1 text-xs bg-red-100 hover:bg-red-200 rounded"
                  >
                    ×
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={col.header}
                onChange={(e) => updateColumn(col.id, { header: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                placeholder="Intestazione"
              />
              <div className="grid grid-cols-2 gap-1">
                <input
                  type="number"
                  value={col.widthFr}
                  onChange={(e) => updateColumn(col.id, { widthFr: Number(e.target.value) })}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                  placeholder="Larghezza"
                  min="1"
                  step="0.5"
                  title="Larghezza (frazioni)"
                />
                <select
                  value={col.type}
                  onChange={(e) => updateColumn(col.id, { type: e.target.value as any })}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                >
                  <option value="text">Testo</option>
                  <option value="number">Numero</option>
                  <option value="dateTime">Data/Ora</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="signature">Firma</option>
                </select>
              </div>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.required || false}
                  onChange={(e) => updateColumn(col.id, { required: e.target.checked })}
                  className="w-3 h-3"
                />
                <span className="text-xs">Obbligatorio</span>
              </label>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );

  return null;
}

