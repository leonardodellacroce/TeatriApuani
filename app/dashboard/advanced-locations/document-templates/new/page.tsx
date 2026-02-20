"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import Palette from "@/components/docbuilder/Palette";
import CanvasA4 from "@/components/docbuilder/CanvasA4";
import PropertyPanel from "@/components/docbuilder/PropertyPanel";
import DocumentRenderer from "@/components/docbuilder/DocumentRenderer";
import { Block, BlockType, PageSettings, TableColumn, Page } from "@/components/docbuilder/types";
import { pxToMm, snapToGrid } from "@/components/docbuilder/mm";
import PageManager from "@/components/docbuilder/PageManager";

interface Template {
  title: string;
  pageSettings: PageSettings;
  pages: Page[];
}

function createDefaultBlock(type: BlockType, xMm: number, yMm: number, z: number): Block {
  const baseId = crypto.randomUUID();
  
  const defaults: Record<BlockType, any> = {
    header: { type: "header", content: "Header documento", logoUrl: null, wMm: 180, hMm: 10 },
    title: { type: "title", text: "Titolo", level: "h1", wMm: 80, hMm: 15 },
    paragraph: { type: "paragraph", html: "<p>Paragrafo di testo...</p>", wMm: 80, hMm: 20 },
    text: { type: "text", label: "", multiline: false, required: false, placeholder: "", bind: null, wMm: 80, hMm: 10 },
    number: { type: "number", label: "", required: false, bind: null, wMm: 40, hMm: 10 },
    dateTime: { type: "dateTime", label: "", mode: "date", bind: null, wMm: 50, hMm: 10 },
    checkbox: { type: "checkbox", label: "", bind: null, wMm: 30, hMm: 8 },
    select: { type: "select", label: "", options: ["Opzione 1", "Opzione 2"], bind: null, wMm: 60, hMm: 10 },
    table: {
      type: "table",
      label: "",
      columns: [
        { id: crypto.randomUUID(), header: "Colonna 1", widthFr: 1, type: "text", required: false },
        { id: crypto.randomUUID(), header: "Colonna 2", widthFr: 1, type: "text", required: false },
      ] as TableColumn[],
      rows: 3,
      wMm: 160,
      hMm: 25,
    },
    repeaterTable: {
      type: "repeaterTable",
      label: "",
      columns: [
        { id: crypto.randomUUID(), header: "Colonna 1", widthFr: 1, type: "text", required: false },
      ] as TableColumn[],
      minRows: 1,
      maxRows: 10,
      wMm: 160,
      hMm: 25,
    },
    group: { type: "group", title: "", wMm: 100, hMm: 50 },
    signature: { type: "signature", label: "", role: "", wMm: 60, hMm: 20 },
    image: { type: "image", imageUrl: null, altText: "Immagine", wMm: 80, hMm: 20 },
    divider: { type: "divider", wMm: 180, hMm: 2 },
    spacer: { type: "spacer", wMm: 10, hMm: 10 },
    dynamicText: { type: "dynamicText", expression: "dataJson.field", wMm: 80, hMm: 10 },
    pageBreak: { type: "pageBreak", wMm: 180, hMm: 5 },
  };

  const def = defaults[type] || { wMm: 80, hMm: 12 };

  // Per i titoli, il grassetto è abilitato di default
  const defaultBold = type === "title" ? true : false;

  // Padding specifici per alcuni tipi di blocco
  let defaultPadding = 1.5;
  if (type === "title" || type === "table" || type === "repeaterTable") {
    defaultPadding = 1;
  } else if (type === "signature") {
    defaultPadding = 2.5;
  }

  return {
    id: baseId,
    xMm,
    yMm,
    z,
    locked: false,
    visibleIf: null,
    style: {
      fontFamily: "Arial",
      fontSize: 10,
      bold: defaultBold,
      italic: false,
      align: "left",
      verticalAlign: "top",
      border: "none",
      paddingMm: defaultPadding,
    },
    ...def,
  } as Block;
}

export default function NewDocumentTemplatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");

  const [template, setTemplate] = useState<Template>({
    title: "Nuovo template",
    pageSettings: {
      size: "A4",
      orientation: "portrait",
      marginTop: 10,
      marginRight: 10,
      marginBottom: 10,
      marginLeft: 10,
      showPageNumbers: true,
      grid: {
        show: true,
        snap: true,
        stepMm: 5,
      },
    },
    pages: [
      {
        id: crypto.randomUUID(),
        blocks: []
      }
    ]
  });

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>(undefined);
  const [showPreview, setShowPreview] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewShowGrid, setPreviewShowGrid] = useState(false);
  const [draggedBlockType, setDraggedBlockType] = useState<BlockType | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showBackDialog, setShowBackDialog] = useState(false);
  const [showDeletePageDialog, setShowDeletePageDialog] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<number | null>(null);
  const [category, setCategory] = useState<string>("");
  const [templateLocationId, setTemplateLocationId] = useState<string>("");
  const [locations, setLocations] = useState<Array<{id: string; name: string}>>([]);

  const mockData = {
    spettacolo: "La Bisbetica Domata",
    data: "2025-11-12",
    coordinatore: "Nome Cognome",
    location: "Teatro Guglielmi",
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    if (status === "loading") return;
    
    if (!isAdmin) {
      router.push("/dashboard");
      return;
    }

    // Carica locations
    fetchLocations();
  }, [isAdmin, status, router]);

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      if (res.ok) {
        const data = await res.json();
        setLocations(data.filter((loc: any) => loc.enabledInAdvancedManagement));
      }
    } catch (error) {
      console.error("Error fetching locations:", error);
    }
  };

  // Autosave debounced e tracciamento modifiche
  useEffect(() => {
    setHasUnsavedChanges(true);
    const timer = setTimeout(() => {
      console.log("Autosave:", template);
    }, 500);
    return () => clearTimeout(timer);
  }, [template]);

  // Helper per accedere ai blocchi della pagina corrente
  const currentBlocks = template.pages[currentPageIndex]?.blocks || [];

  // Gestione hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // DEL per eliminare
      if (e.key === "Delete" && selectedBlockId) {
        const block = currentBlocks.find((b) => b.id === selectedBlockId);
        if (block && !block.locked) {
          handleDeleteBlock(selectedBlockId);
        }
      }

      // Cmd/Ctrl + D per duplicare
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedBlockId) {
        e.preventDefault();
        handleDuplicate();
      }

      // Cmd/Ctrl + ] per portare davanti
      if ((e.metaKey || e.ctrlKey) && e.key === "]" && selectedBlockId) {
        e.preventDefault();
        handleBringToFront();
      }

      // Cmd/Ctrl + [ per mandare dietro
      if ((e.metaKey || e.ctrlKey) && e.key === "[" && selectedBlockId) {
        e.preventDefault();
        handleSendToBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBlockId, currentBlocks, currentPageIndex]);

  const handleDragStart = (event: DragStartEvent) => {
    const activeData = event.active.data.current as any;
    if (activeData?.fromPalette) {
      setDraggedBlockType(activeData.type);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedBlockType(null);
    const { active, over, delta } = event;

    if (!over || over.id !== "canvas-dropzone") return;

    const activeData = active.data.current as any;

    // Drop dalla palette (solo se effettivamente trascinato, non click)
    if (activeData?.fromPalette && (Math.abs(delta.x) > 10 || Math.abs(delta.y) > 10)) {
      const blockType = activeData.type as BlockType;
      
      // Usa la posizione del drop (dove è stato rilasciato il mouse)
      const overRect = (over as any).rect;
      if (!overRect) return;

      // Converti la posizione del mouse in coordinate mm relative al canvas
      const canvasRect = document.querySelector('[data-canvas="true"]')?.getBoundingClientRect();
      if (!canvasRect) return;

      const mouseX = event.activatorEvent ? (event.activatorEvent as MouseEvent).clientX + delta.x : 0;
      const mouseY = event.activatorEvent ? (event.activatorEvent as MouseEvent).clientY + delta.y : 0;

      const relativeX = mouseX - canvasRect.left;
      const relativeY = mouseY - canvasRect.top;

      let xMm = pxToMm(relativeX);
      let yMm = pxToMm(relativeY);

      // Snap alla griglia
      if (template.pageSettings.grid?.snap) {
        xMm = snapToGrid(xMm, template.pageSettings.grid.stepMm);
        yMm = snapToGrid(yMm, template.pageSettings.grid.stepMm);
      }

      // Limiti ai margini
      const pageMm = template.pageSettings.orientation === "portrait" 
        ? { w: 210, h: 297 }
        : { w: 297, h: 210 };
      
      const usableXMm = template.pageSettings.marginLeft;
      const usableYMm = template.pageSettings.marginTop;
      const usableWMm = pageMm.w - template.pageSettings.marginLeft - template.pageSettings.marginRight;
      const usableHMm = pageMm.h - template.pageSettings.marginTop - template.pageSettings.marginBottom;

      const newBlock = createDefaultBlock(blockType, xMm, yMm, currentBlocks.length);

      // Limita alle dimensioni utilizzabili
      newBlock.xMm = Math.max(usableXMm, Math.min(newBlock.xMm, usableXMm + usableWMm - newBlock.wMm));
      newBlock.yMm = Math.max(usableYMm, Math.min(newBlock.yMm, usableYMm + usableHMm - (newBlock.hMm || 10)));

      handleAddBlock(newBlock);
      setSelectedBlockId(newBlock.id);
    }
    // Movimento blocco sul canvas
    else if (activeData?.fromCanvas) {
      const block = activeData.block as Block;
      if (block.locked) return;

      const deltaMm = {
        x: pxToMm(delta.x),
        y: pxToMm(delta.y),
      };

      let newX = block.xMm + deltaMm.x;
      let newY = block.yMm + deltaMm.y;

      // Snap alla griglia
      if (template.pageSettings.grid?.snap) {
        newX = snapToGrid(newX, template.pageSettings.grid.stepMm);
        newY = snapToGrid(newY, template.pageSettings.grid.stepMm);
      }

      // Limiti ai margini
      const pageMm = template.pageSettings.orientation === "portrait" 
        ? { w: 210, h: 297 }
        : { w: 297, h: 210 };
      
      const usableXMm = template.pageSettings.marginLeft;
      const usableYMm = template.pageSettings.marginTop;
      const usableWMm = pageMm.w - template.pageSettings.marginLeft - template.pageSettings.marginRight;
      const usableHMm = pageMm.h - template.pageSettings.marginTop - template.pageSettings.marginBottom;

      newX = Math.max(usableXMm, Math.min(newX, usableXMm + usableWMm - block.wMm));
      newY = Math.max(usableYMm, Math.min(newY, usableYMm + usableHMm - (block.hMm || 10)));

      handleUpdateBlock(block.id, { xMm: newX, yMm: newY });
    }
  };

  const handleAddBlock = (block: Block) => {
    setTemplate((prev) => {
      const newPages = [...prev.pages];
      newPages[currentPageIndex] = {
        ...newPages[currentPageIndex],
        blocks: [...newPages[currentPageIndex].blocks, block],
      };
      return { ...prev, pages: newPages };
    });
  };

  const handleUpdateBlock = (id: string, patch: Partial<Block>) => {
    setTemplate((prev) => {
      const newPages = [...prev.pages];
      newPages[currentPageIndex] = {
        ...newPages[currentPageIndex],
        blocks: newPages[currentPageIndex].blocks.map((b) => (b.id === id ? { ...b, ...patch } as Block : b)),
      };
      return { ...prev, pages: newPages };
    });
  };

  const handleUpdateBlockSpecific = (block: Block) => {
    setTemplate((prev) => {
      const newPages = [...prev.pages];
      newPages[currentPageIndex] = {
        ...newPages[currentPageIndex],
        blocks: newPages[currentPageIndex].blocks.map((b) => (b.id === block.id ? block : b)),
      };
      return { ...prev, pages: newPages };
    });
  };

  const handleSelectBlock = (id?: string) => {
    setSelectedBlockId(id);
  };

  const handleDeleteBlock = (id: string) => {
    setTemplate((prev) => {
      const newPages = [...prev.pages];
      newPages[currentPageIndex] = {
        ...newPages[currentPageIndex],
        blocks: newPages[currentPageIndex].blocks.filter((b) => b.id !== id),
      };
      return { ...prev, pages: newPages };
    });
    setSelectedBlockId(undefined);
  };

  const handleDuplicate = () => {
    if (!selectedBlockId) return;
    const block = currentBlocks.find((b) => b.id === selectedBlockId);
    if (!block) return;

    const newBlock = {
      ...block,
      id: crypto.randomUUID(),
      xMm: block.xMm + 5,
      yMm: block.yMm + 5,
      z: currentBlocks.length,
    };

    handleAddBlock(newBlock);
    setSelectedBlockId(newBlock.id);
  };

  const handleToggleLock = () => {
    if (!selectedBlockId) return;
    const block = currentBlocks.find((b) => b.id === selectedBlockId);
    if (!block) return;
    handleUpdateBlock(selectedBlockId, { locked: !block.locked });
  };

  const handleBringToFront = () => {
    if (!selectedBlockId) return;
    const maxZ = Math.max(...currentBlocks.map((b) => b.z || 0), 0);
    handleUpdateBlock(selectedBlockId, { z: maxZ + 1 });
  };

  const handleSendToBack = () => {
    if (!selectedBlockId) return;
    const minZ = Math.min(...currentBlocks.map((b) => b.z || 0), 0);
    handleUpdateBlock(selectedBlockId, { z: minZ - 1 });
  };

  // Gestione pagine
  const handleAddPage = () => {
    setTemplate((prev) => ({
      ...prev,
      pages: [
        ...prev.pages,
        {
          id: crypto.randomUUID(),
          blocks: [],
        },
      ],
    }));
    setCurrentPageIndex(template.pages.length);
    setSelectedBlockId(undefined);
  };

  const handleDuplicatePage = (index: number) => {
    const pageToDuplicate = template.pages[index];
    if (!pageToDuplicate) return;

    const newPage: Page = {
      id: crypto.randomUUID(),
      blocks: pageToDuplicate.blocks.map((block) => ({
        ...block,
        id: crypto.randomUUID(),
      })),
    };

    setTemplate((prev) => {
      const newPages = [...prev.pages];
      newPages.splice(index + 1, 0, newPage);
      return { ...prev, pages: newPages };
    });
    setCurrentPageIndex(index + 1);
    setSelectedBlockId(undefined);
  };

  const handleDeletePage = (index: number) => {
    if (template.pages.length <= 1) return;
    setPageToDelete(index);
    setShowDeletePageDialog(true);
  };

  const confirmDeletePage = () => {
    if (pageToDelete === null) return;

    setTemplate((prev) => ({
      ...prev,
      pages: prev.pages.filter((_, i) => i !== pageToDelete),
    }));

    if (currentPageIndex >= template.pages.length - 1) {
      setCurrentPageIndex(Math.max(0, template.pages.length - 2));
    }
    setSelectedBlockId(undefined);
    setShowDeletePageDialog(false);
    setPageToDelete(null);
  };

  const handleMovePage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= template.pages.length) return;

    setTemplate((prev) => {
      const newPages = [...prev.pages];
      const [movedPage] = newPages.splice(fromIndex, 1);
      newPages.splice(toIndex, 0, movedPage);
      return { ...prev, pages: newPages };
    });
    setCurrentPageIndex(toIndex);
  };

  const handleSelectPage = (index: number) => {
    setCurrentPageIndex(index);
    setSelectedBlockId(undefined);
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setShowBackDialog(true);
    } else {
      router.push("/dashboard/advanced-locations/document-templates");
    }
  };

  const confirmBack = () => {
    setShowBackDialog(false);
    router.push("/dashboard/advanced-locations/document-templates");
  };

  const handleSave = async () => {
    try {
      console.log("Invio template:", template);
      
      const res = await fetch("/api/doc-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: template.title,
          description: null,
          category: category || null,
          pageSettings: template.pageSettings,
          pages: template.pages,
          locationId: templateLocationId || null,
        }),
      });

      console.log("Response status:", res.status);

      if (res.ok) {
        const data = await res.json();
        console.log("Template salvato:", data);
        setHasUnsavedChanges(false);
        router.push("/dashboard/advanced-locations/document-templates");
      } else {
        const errorText = await res.text();
        console.error("Errore salvataggio (status", res.status, "):", errorText);
        try {
          const errorJson = JSON.parse(errorText);
          console.error("Error details:", errorJson);
        } catch {}
        alert("Errore durante il salvataggio del template: " + errorText);
      }
    } catch (error) {
      console.error("Error saving template:", error);
      alert("Errore durante il salvataggio del template");
    }
  };

  const handlePreview = () => {
    console.log("Anteprima template:", template);
    setShowPreview(true);
  };

  if (status === "loading") {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Caricamento...</p>
        </div>
      </DashboardShell>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const selectedBlock = currentBlocks.find((b) => b.id === selectedBlockId);

  return (
    <DashboardShell>
      {/* Topbar fissa */}
      <div className="sticky top-0 z-10 bg-white shadow-md border-b border-gray-200 -mx-4 -mt-8 px-4 py-4 mb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4 flex-1">
              <button
                onClick={handleBack}
                aria-label="Indietro"
                title="Indietro"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex-1 flex gap-3">
                <input
                  type="text"
                  value={template.title}
                  onChange={(e) => setTemplate({ ...template, title: e.target.value })}
                  className="flex-1 max-w-md px-4 py-2 text-xl font-semibold border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Titolo template"
                />
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                  placeholder="Categoria"
                />
                <select
                  value={templateLocationId}
                  onChange={(e) => setTemplateLocationId(e.target.value)}
                  className="w-56 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                >
                  <option value="">Nessuna location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Pulsanti allineamento blocco */}
              {selectedBlockId && (
                <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
                  <span className="text-xs text-gray-600">Allinea:</span>
                  <div className="flex gap-1">
                    {/* Allineamento orizzontale */}
                    <button
                      onClick={() => {
                        const block = currentBlocks.find(b => b.id === selectedBlockId);
                        if (!block) return;
                        const pageMm = template.pageSettings.orientation === "portrait" ? { w: 210, h: 297 } : { w: 297, h: 210 };
                        const usableWMm = pageMm.w - template.pageSettings.marginLeft - template.pageSettings.marginRight;
                        handleUpdateBlock(selectedBlockId, { xMm: template.pageSettings.marginLeft });
                      }}
                      className="p-1.5 border border-gray-300 rounded hover:bg-gray-100"
                      title="Allinea a sinistra"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h10M4 18h14" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        const block = currentBlocks.find(b => b.id === selectedBlockId);
                        if (!block) return;
                        const pageMm = template.pageSettings.orientation === "portrait" ? { w: 210, h: 297 } : { w: 297, h: 210 };
                        const usableWMm = pageMm.w - template.pageSettings.marginLeft - template.pageSettings.marginRight;
                        handleUpdateBlock(selectedBlockId, { xMm: template.pageSettings.marginLeft + (usableWMm - block.wMm) / 2 });
                      }}
                      className="p-1.5 border border-gray-300 rounded hover:bg-gray-100"
                      title="Centra orizzontalmente"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M7 12h10M4 18h16" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        const block = currentBlocks.find(b => b.id === selectedBlockId);
                        if (!block) return;
                        const pageMm = template.pageSettings.orientation === "portrait" ? { w: 210, h: 297 } : { w: 297, h: 210 };
                        const usableWMm = pageMm.w - template.pageSettings.marginLeft - template.pageSettings.marginRight;
                        handleUpdateBlock(selectedBlockId, { xMm: template.pageSettings.marginLeft + usableWMm - block.wMm });
                      }}
                      className="p-1.5 border border-gray-300 rounded hover:bg-gray-100"
                      title="Allinea a destra"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M10 12h10M6 18h14" />
                      </svg>
                    </button>
                    <span className="w-px h-8 bg-gray-300 mx-1"></span>
                    {/* Allineamento verticale */}
                    <button
                      onClick={() => {
                        const block = currentBlocks.find(b => b.id === selectedBlockId);
                        if (!block) return;
                        handleUpdateBlock(selectedBlockId, { yMm: template.pageSettings.marginTop });
                      }}
                      className="p-1.5 border border-gray-300 rounded hover:bg-gray-100"
                      title="Allinea in alto"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                        <line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <line x1="4" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <line x1="4" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        const block = currentBlocks.find(b => b.id === selectedBlockId);
                        if (!block) return;
                        const pageMm = template.pageSettings.orientation === "portrait" ? { w: 210, h: 297 } : { w: 297, h: 210 };
                        const usableHMm = pageMm.h - template.pageSettings.marginTop - template.pageSettings.marginBottom;
                        handleUpdateBlock(selectedBlockId, { yMm: template.pageSettings.marginTop + (usableHMm - (block.hMm || 10)) / 2 });
                      }}
                      className="p-1.5 border border-gray-300 rounded hover:bg-gray-100"
                      title="Centra verticalmente"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                        <line x1="4" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <line x1="4" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        const block = currentBlocks.find(b => b.id === selectedBlockId);
                        if (!block) return;
                        const pageMm = template.pageSettings.orientation === "portrait" ? { w: 210, h: 297 } : { w: 297, h: 210 };
                        const usableHMm = pageMm.h - template.pageSettings.marginTop - template.pageSettings.marginBottom;
                        handleUpdateBlock(selectedBlockId, { yMm: template.pageSettings.marginTop + usableHMm - (block.hMm || 10) });
                      }}
                      className="p-1.5 border border-gray-300 rounded hover:bg-gray-100"
                      title="Allinea in basso"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                        <line x1="4" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <line x1="4" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={handlePreview}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all"
              >
                Anteprima
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg transition-all"
              >
                Salva
              </button>
            </div>
          </div>

          {/* Controlli pagina */}
          <div className="flex items-center gap-6 text-sm flex-wrap">
            {/* Orientamento */}
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-medium">Orientamento:</span>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setTemplate({ 
                    ...template, 
                    pageSettings: { ...template.pageSettings, orientation: "portrait" }
                  })}
                  className={`px-3 py-1 ${
                    template.pageSettings.orientation === "portrait"
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  } transition-colors`}
                >
                  Verticale
                </button>
                <button
                  onClick={() => setTemplate({ 
                    ...template, 
                    pageSettings: { ...template.pageSettings, orientation: "landscape" }
                  })}
                  className={`px-3 py-1 ${
                    template.pageSettings.orientation === "landscape"
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  } transition-colors`}
                >
                  Orizzontale
                </button>
              </div>
            </div>

            {/* Margini */}
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-medium">Margini (mm):</span>
              <div className="flex flex-col items-center">
                <input
                  type="number"
                  value={template.pageSettings.marginTop}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, marginTop: Number(e.target.value) }
                  })}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  min="0"
                />
                <span className="text-xs text-gray-500 mt-0.5">Alto</span>
              </div>
              <div className="flex flex-col items-center">
                <input
                  type="number"
                  value={template.pageSettings.marginRight}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, marginRight: Number(e.target.value) }
                  })}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  min="0"
                />
                <span className="text-xs text-gray-500 mt-0.5">Destra</span>
              </div>
              <div className="flex flex-col items-center">
                <input
                  type="number"
                  value={template.pageSettings.marginBottom}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, marginBottom: Number(e.target.value) }
                  })}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  min="0"
                />
                <span className="text-xs text-gray-500 mt-0.5">Basso</span>
              </div>
              <div className="flex flex-col items-center">
                <input
                  type="number"
                  value={template.pageSettings.marginLeft}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, marginLeft: Number(e.target.value) }
                  })}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  min="0"
                />
                <span className="text-xs text-gray-500 mt-0.5">Sinistra</span>
              </div>
            </div>

            {/* Numeri di pagina */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={template.pageSettings.showPageNumbers}
                onChange={(e) => setTemplate({
                  ...template,
                  pageSettings: { ...template.pageSettings, showPageNumbers: e.target.checked }
                })}
                className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
              />
              <span className="text-gray-600 font-medium">Numeri di pagina</span>
            </label>

            {/* Intestazione */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={template.pageSettings.showHeader || false}
                onChange={(e) => setTemplate({
                  ...template,
                  pageSettings: { ...template.pageSettings, showHeader: e.target.checked }
                })}
                className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
              />
              <span className="text-gray-600 font-medium">Intestazione</span>
            </label>

            {/* Piè di pagina */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={template.pageSettings.showFooter || false}
                onChange={(e) => setTemplate({
                  ...template,
                  pageSettings: { ...template.pageSettings, showFooter: e.target.checked }
                })}
                className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
              />
              <span className="text-gray-600 font-medium">Piè di pagina</span>
            </label>

            {/* Snap alla griglia */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={template.pageSettings.grid?.snap || false}
                onChange={(e) => setTemplate({
                  ...template,
                  pageSettings: {
                    ...template.pageSettings,
                    grid: { ...template.pageSettings.grid!, snap: e.target.checked },
                  },
                })}
                className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
              />
              <span className="text-gray-600 font-medium">Snap griglia</span>
            </label>
          </div>

          {/* Controlli Intestazione */}
          {template.pageSettings.showHeader && (
            <div className="flex items-center gap-4 text-sm flex-wrap border-t border-gray-300 pt-3 mt-2">
              <span className="text-gray-700 font-semibold">Intestazione:</span>
              
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Altezza (mm):</span>
                <input
                  type="number"
                  value={template.pageSettings.headerHeight || 5}
                  onChange={(e) => {
                    const oldHeight = template.pageSettings.headerHeight || 5;
                    const newHeight = Number(e.target.value);
                    const heightDiff = newHeight - oldHeight;
                    setTemplate({
                      ...template,
                      pageSettings: { 
                        ...template.pageSettings, 
                        headerHeight: newHeight,
                        marginTop: template.pageSettings.marginTop + heightDiff
                      }
                    });
                  }}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  min="3"
                  max="20"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Font:</span>
                <select
                  value={template.pageSettings.headerFontFamily || "Arial"}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, headerFontFamily: e.target.value }
                  })}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Dimensione (pt):</span>
                <input
                  type="number"
                  value={template.pageSettings.headerFontSize || 10}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, headerFontSize: Number(e.target.value) }
                  })}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  min="6"
                  max="24"
                />
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, headerBold: !template.pageSettings.headerBold }
                  })}
                  className={`w-7 h-7 flex items-center justify-center border rounded ${
                    template.pageSettings.headerBold 
                      ? "bg-gray-900 text-white border-gray-900" 
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                  title="Grassetto"
                >
                  <span className="font-bold text-sm">G</span>
                </button>
                <button
                  onClick={() => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, headerItalic: !template.pageSettings.headerItalic }
                  })}
                  className={`w-7 h-7 flex items-center justify-center border rounded ${
                    template.pageSettings.headerItalic 
                      ? "bg-gray-900 text-white border-gray-900" 
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                  title="Corsivo"
                >
                  <span className="italic text-sm">C</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Allineamento H:</span>
                <select
                  value={template.pageSettings.headerAlign || "left"}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, headerAlign: e.target.value as "left" | "center" | "right" }
                  })}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="left">Sinistra</option>
                  <option value="center">Centro</option>
                  <option value="right">Destra</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Allineamento V:</span>
                <select
                  value={template.pageSettings.headerVerticalAlign || "middle"}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, headerVerticalAlign: e.target.value as "top" | "middle" | "bottom" }
                  })}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="top">Alto</option>
                  <option value="middle">Centro</option>
                  <option value="bottom">Basso</option>
                </select>
              </div>
            </div>
          )}

          {/* Controlli Piè di pagina */}
          {template.pageSettings.showFooter && (
            <div className="flex items-center gap-4 text-sm flex-wrap border-t border-gray-300 pt-3 mt-2">
              <span className="text-gray-700 font-semibold">Piè di pagina:</span>
              
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Altezza (mm):</span>
                <input
                  type="number"
                  value={template.pageSettings.footerHeight || 5}
                  onChange={(e) => {
                    const oldHeight = template.pageSettings.footerHeight || 5;
                    const newHeight = Number(e.target.value);
                    const heightDiff = newHeight - oldHeight;
                    setTemplate({
                      ...template,
                      pageSettings: { 
                        ...template.pageSettings, 
                        footerHeight: newHeight,
                        marginBottom: template.pageSettings.marginBottom + heightDiff
                      }
                    });
                  }}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  min="3"
                  max="20"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Font:</span>
                <select
                  value={template.pageSettings.footerFontFamily || "Arial"}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, footerFontFamily: e.target.value }
                  })}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Dimensione (pt):</span>
                <input
                  type="number"
                  value={template.pageSettings.footerFontSize || 10}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, footerFontSize: Number(e.target.value) }
                  })}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  min="6"
                  max="24"
                />
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, footerBold: !template.pageSettings.footerBold }
                  })}
                  className={`w-7 h-7 flex items-center justify-center border rounded ${
                    template.pageSettings.footerBold 
                      ? "bg-gray-900 text-white border-gray-900" 
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                  title="Grassetto"
                >
                  <span className="font-bold text-sm">G</span>
                </button>
                <button
                  onClick={() => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, footerItalic: !template.pageSettings.footerItalic }
                  })}
                  className={`w-7 h-7 flex items-center justify-center border rounded ${
                    template.pageSettings.footerItalic 
                      ? "bg-gray-900 text-white border-gray-900" 
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                  title="Corsivo"
                >
                  <span className="italic text-sm">C</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Allineamento H:</span>
                <select
                  value={template.pageSettings.footerAlign || "left"}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, footerAlign: e.target.value as "left" | "center" | "right" }
                  })}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="left">Sinistra</option>
                  <option value="center">Centro</option>
                  <option value="right">Destra</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Allineamento V:</span>
                <select
                  value={template.pageSettings.footerVerticalAlign || "middle"}
                  onChange={(e) => setTemplate({
                    ...template,
                    pageSettings: { ...template.pageSettings, footerVerticalAlign: e.target.value as "top" | "middle" | "bottom" }
                  })}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="top">Alto</option>
                  <option value="middle">Centro</option>
                  <option value="bottom">Basso</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gestione pagine */}
      <PageManager
        pages={template.pages}
        currentPageIndex={currentPageIndex}
        onSelectPage={handleSelectPage}
        onAddPage={handleAddPage}
        onDuplicatePage={handleDuplicatePage}
        onDeletePage={handleDeletePage}
        onMovePage={handleMovePage}
      />

      {/* Layout dinamico in base all'orientamento */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={`flex gap-6 ${template.pageSettings.orientation === "portrait" ? "flex-row h-[calc(100vh-300px)]" : "flex-col"}`}>
          {/* Canvas */}
          <div className={template.pageSettings.orientation === "portrait" ? "flex-1" : "w-full"}>
            {/* Controlli zoom */}
            <div className="flex items-center gap-3 mb-3 bg-white rounded-lg border border-gray-200 p-3">
              <span className="text-sm text-gray-600 font-medium">Zoom:</span>
              <button
                onClick={() => setCanvasZoom(Math.max(0.5, canvasZoom - 0.1))}
                className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
              >
                <span className="text-gray-700">−</span>
              </button>
              <input
                type="range"
                min="50"
                max="200"
                value={canvasZoom * 100}
                onChange={(e) => setCanvasZoom(Number(e.target.value) / 100)}
                className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <button
                onClick={() => setCanvasZoom(Math.min(2, canvasZoom + 0.1))}
                className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
              >
                <span className="text-gray-700">+</span>
              </button>
              <button
                onClick={() => setCanvasZoom(1)}
                className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
                title="Ripristina zoom 100%"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <span className="text-sm text-gray-700 font-medium min-w-[3rem]">{Math.round(canvasZoom * 100)}%</span>
            </div>
            
            <CanvasA4
              page={template.pageSettings}
              blocks={currentBlocks}
              selectedId={selectedBlockId}
              onAddBlock={handleAddBlock}
              onUpdateBlock={handleUpdateBlock}
              onSelectBlock={handleSelectBlock}
              onDeleteBlock={handleDeleteBlock}
              onUpdatePageSettings={(patch) => setTemplate({
                ...template,
                pageSettings: { ...template.pageSettings, ...patch }
              })}
              zoom={canvasZoom}
            />
          </div>

          {/* Palette blocchi e Proprietà */}
          <div className={`flex gap-6 ${template.pageSettings.orientation === "portrait" ? "w-80 flex-col overflow-y-auto" : "w-full flex-row overflow-x-auto"}`}>
            {/* Blocchi disponibili */}
            <div className={`bg-white rounded-lg border border-gray-200 p-4 transition-all duration-300 overflow-hidden ${
              template.pageSettings.orientation === "landscape" 
                ? (selectedBlockId ? "w-48" : "w-1/2")
                : (selectedBlockId ? "max-h-24" : "max-h-[600px]")
            }`}>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Aggiungi blocchi</h3>
              {selectedBlockId ? (
                <div className="text-xs text-gray-500">
                  Deseleziona il blocco per visualizzare i blocchi disponibili
                </div>
              ) : (
                <Palette onBlockClick={(blockType) => {
                  // Calcola il centro dell'area utilizzabile
                  const pageMm = template.pageSettings.orientation === "portrait" 
                    ? { w: 210, h: 297 }
                    : { w: 297, h: 210 };
                  
                  const usableWMm = pageMm.w - template.pageSettings.marginLeft - template.pageSettings.marginRight;
                  const usableHMm = pageMm.h - template.pageSettings.marginTop - template.pageSettings.marginBottom;
                  
                  const newBlock = createDefaultBlock(
                    blockType,
                    template.pageSettings.marginLeft + usableWMm / 2 - 40,
                    template.pageSettings.marginTop + usableHMm / 2 - 10,
                    currentBlocks.length
                  );

                  // Snap alla griglia
                  if (template.pageSettings.grid?.snap) {
                    newBlock.xMm = snapToGrid(newBlock.xMm, template.pageSettings.grid.stepMm);
                    newBlock.yMm = snapToGrid(newBlock.yMm, template.pageSettings.grid.stepMm);
                  }

                  handleAddBlock(newBlock);
                  setSelectedBlockId(newBlock.id);
                }} />
              )}
            </div>

            {/* Proprietà blocco */}
            <div className={`bg-white rounded-lg border border-gray-200 transition-all duration-300 ${
              template.pageSettings.orientation === "landscape" 
                ? "flex-1 overflow-y-auto"
                : (selectedBlockId ? "max-h-[calc(100vh-300px)] overflow-y-auto" : "max-h-20 overflow-hidden")
            }`}>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Proprietà blocco</h3>
                <PropertyPanel
                selected={selectedBlock}
                onChange={(patch) => {
                  if (selectedBlockId) {
                    handleUpdateBlock(selectedBlockId, patch);
                  }
                }}
                onChangeSpecific={handleUpdateBlockSpecific}
                onDuplicate={handleDuplicate}
                onToggleLock={handleToggleLock}
                onBringToFront={handleBringToFront}
                onSendToBack={handleSendToBack}
                isLandscape={template.pageSettings.orientation === "landscape"}
              />
              </div>
            </div>
          </div>
        </div>

        {/* Overlay durante il drag */}
        <DragOverlay>
          {draggedBlockType && (
            <div className="bg-white border-2 border-blue-500 rounded shadow-xl p-4 opacity-90">
              <div className="text-sm font-medium text-gray-700">
                {draggedBlockType.charAt(0).toUpperCase() + draggedBlockType.slice(1)}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Modal Anteprima */}
      {showPreview && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header modal */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold">Anteprima Template</h2>
              <div className="flex items-center gap-4">
                {/* Zoom */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Zoom:</span>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={previewScale * 100}
                    onChange={(e) => setPreviewScale(Number(e.target.value) / 100)}
                    className="w-32"
                  />
                  <span className="text-sm text-gray-600 w-12">{Math.round(previewScale * 100)}%</span>
                </div>
                {/* Toggle griglia */}
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={previewShowGrid}
                    onChange={(e) => setPreviewShowGrid(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>Mostra griglia</span>
                </label>
                {/* Chiudi */}
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contenuto scrollabile */}
            <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
              <DocumentRenderer
                template={template}
                data={mockData}
                scale={previewScale}
                showGrid={previewShowGrid}
              />
            </div>
          </div>
        </div>
      )}

      {/* Dialog conferma eliminazione pagina */}
      <ConfirmDialog
        isOpen={showDeletePageDialog}
        title="Elimina Pagina"
        message={`Sei sicuro di voler eliminare la pagina ${(pageToDelete ?? 0) + 1}? Questa azione non può essere annullata.`}
        onConfirm={confirmDeletePage}
        onCancel={() => {
          setShowDeletePageDialog(false);
          setPageToDelete(null);
        }}
      />

      {/* Dialog conferma uscita senza salvare */}
      <ConfirmDialog
        isOpen={showBackDialog}
        title="Modifiche non salvate"
        message="Hai modifiche non salvate. Sei sicuro di voler uscire senza salvare?"
        onConfirm={confirmBack}
        onCancel={() => setShowBackDialog(false)}
      />
    </DashboardShell>
  );
}
