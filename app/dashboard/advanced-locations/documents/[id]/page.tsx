"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import SignatureBlock from "@/components/docbuilder/SignatureBlock";
import DocumentRenderer from "@/components/docbuilder/DocumentRenderer";
import { DocTemplateJson, Block } from "@/components/docbuilder/types";

interface DocInstance {
  id: string;
  templateId: string;
  title: string;
  dataJson: string;
  status: string;
  pdfUrl: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  signedAt: string | null;
  signedBy: string | null;
  signEvents: SignEvent[];
}

interface SignEvent {
  id: string;
  instanceId: string;
  templateId: string;
  userId: string;
  signaturePngUrl: string | null;
  signatureHash: string;
  signedAtUtc: string;
  signedAtLocal: string;
  tz: string;
  tzOffsetMinutes: number;
  userAgent: string | null;
  ipHash: string | null;
  blockId: string | null;
  role: string | null;
  createdAt: string;
}

export default function DocumentInstancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const instanceId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [instance, setInstance] = useState<DocInstance | null>(null);
  const [template, setTemplate] = useState<DocTemplateJson | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user) {
      router.push("/dashboard");
      return;
    }

    if (instanceId) {
      fetchInstance();
    }
  }, [session, status, router, instanceId]);

  const fetchInstance = async () => {
    try {
      const [instanceRes, templateRes] = await Promise.all([
        fetch(`/api/docs/instances/${instanceId}`),
        fetch(`/api/docs/instances/${instanceId}`).then(async (res) => {
          if (res.ok) {
            const inst = await res.json();
            return fetch(`/api/doc-templates/${inst.templateId}`);
          }
          throw new Error("Instance not found");
        }),
      ]);

      if (!instanceRes.ok) {
        alert("Istanza non trovata");
        router.push("/dashboard/advanced-locations/documents");
        return;
      }

      const instanceData = await instanceRes.json();
      setInstance(instanceData);
      setFormData(JSON.parse(instanceData.dataJson || "{}"));

      if (templateRes.ok) {
        const templateData = await templateRes.json();
        const parsedTemplate: DocTemplateJson = {
          title: templateData.title,
          pageSettings: JSON.parse(templateData.pageSettings),
          pages: JSON.parse(templateData.blocksJson),
        };
        setTemplate(parsedTemplate);
      }
    } catch (error) {
      console.error("Error fetching instance:", error);
      alert("Errore nel caricamento dell'istanza");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = async (fieldKey: string, value: any) => {
    const newFormData = { ...formData, [fieldKey]: value };
    setFormData(newFormData);

    // Autosave
    if (instance?.status === "DRAFT") {
      try {
        await fetch(`/api/docs/instances/${instanceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataJson: newFormData }),
        });
      } catch (error) {
        console.error("Autosave error:", error);
      }
    }
  };

  const handleSigned = (payload: {
    signaturePngUrl: string;
    signatureHash: string;
    status: string;
  }) => {
    // Aggiorna lo stato locale
    if (instance) {
      setInstance({
        ...instance,
        status: payload.status,
      });
    }

    // Ricarica l'istanza per avere i dati aggiornati
    fetchInstance();
  };

  const handleGeneratePDF = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/doc-templates/${instance?.templateId}/preview-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.pdfUrl) {
          window.open(data.pdfUrl, "_blank");
        }
      } else {
        alert("Errore nella generazione del PDF");
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Errore nella generazione del PDF");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm("Sei sicuro di voler archiviare questo documento? Una volta archiviato non potrà più essere modificato.")) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/docs/instances/${instanceId}/archive`, {
        method: "POST",
      });

      if (response.ok) {
        fetchInstance(); // Ricarica per aggiornare lo stato
        alert("Documento archiviato con successo");
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Errore durante l'archiviazione");
      }
    } catch (error) {
      console.error("Error archiving:", error);
      alert("Errore durante l'archiviazione");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Caricamento...</p>
        </div>
      </DashboardShell>
    );
  }

  if (!instance || !template) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Istanza non trovata</p>
        </div>
      </DashboardShell>
    );
  }

  const isReadonly = instance.status !== "DRAFT";

  // Estrai tutti i blocchi da tutte le pagine
  const allBlocks: Block[] = [];
  if (template.pages) {
    for (const page of template.pages) {
      allBlocks.push(...page.blocks);
    }
  }

  // Filtra solo i blocchi di input
  const inputBlocks = allBlocks.filter((b) =>
    ["text", "number", "dateTime", "checkbox", "select", "signature"].includes(b.type)
  );

  const signatureBlocks = allBlocks.filter((b) => b.type === "signature");

  return (
    <DashboardShell>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard/advanced-locations/documents")}
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{instance.title}</h1>
              <p className="text-sm text-gray-500">Template: {template.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Badge stato */}
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                instance.status === "DRAFT"
                  ? "bg-yellow-100 text-yellow-800"
                  : instance.status === "SIGNED"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {instance.status}
            </span>

            {/* Pulsante Genera PDF */}
            <button
              onClick={handleGeneratePDF}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Generazione..." : "Genera PDF"}
            </button>

            {/* Pulsante Archivia (solo se SIGNED e utente è admin) */}
            {instance.status === "SIGNED" && ["ADMIN", "SUPER_ADMIN"].includes(session?.user?.role || "") && (
              <button
                onClick={handleArchive}
                disabled={saving}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
              >
                Archivia
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonna sinistra: Form di compilazione */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4">Compilazione Documento</h2>

            {inputBlocks.length === 0 && signatureBlocks.length === 0 && (
              <p className="text-gray-500 text-sm">
                Nessun campo da compilare in questo template
              </p>
            )}

            {/* Campi di input */}
            <div className="space-y-4">
              {inputBlocks.map((block: any) => {
                const bindKey = block.bind || block.id;

                if (block.type === "signature") {
                  return (
                    <div key={block.id} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {block.label || "Firma"}
                        {block.role && (
                          <span className="text-gray-500 ml-2">({block.role})</span>
                        )}
                      </label>
                      <SignatureBlock
                        instanceId={instanceId}
                        blockId={block.id}
                        role={block.role}
                        disabled={isReadonly}
                        onSigned={handleSigned}
                      />
                    </div>
                  );
                }

                if (block.type === "text") {
                  return (
                    <div key={block.id} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {block.label}
                        {block.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <input
                        type="text"
                        value={formData[bindKey] || ""}
                        onChange={(e) => handleFieldChange(bindKey, e.target.value)}
                        disabled={isReadonly}
                        placeholder={block.placeholder || ""}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  );
                }

                if (block.type === "number") {
                  return (
                    <div key={block.id} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {block.label}
                        {block.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <input
                        type="number"
                        value={formData[bindKey] || ""}
                        onChange={(e) => handleFieldChange(bindKey, e.target.value)}
                        disabled={isReadonly}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  );
                }

                if (block.type === "dateTime") {
                  const inputType = block.mode === "date" ? "date" : block.mode === "time" ? "time" : "datetime-local";
                  return (
                    <div key={block.id} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {block.label}
                      </label>
                      <input
                        type={inputType}
                        value={formData[bindKey] || ""}
                        onChange={(e) => handleFieldChange(bindKey, e.target.value)}
                        disabled={isReadonly}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  );
                }

                if (block.type === "checkbox") {
                  return (
                    <div key={block.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData[bindKey] || false}
                        onChange={(e) => handleFieldChange(bindKey, e.target.checked)}
                        disabled={isReadonly}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
                      />
                      <label className="text-sm font-medium text-gray-700">
                        {block.label}
                      </label>
                    </div>
                  );
                }

                if (block.type === "select") {
                  return (
                    <div key={block.id} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {block.label}
                      </label>
                      <select
                        value={formData[bindKey] || ""}
                        onChange={(e) => handleFieldChange(bindKey, e.target.value)}
                        disabled={isReadonly}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">Seleziona...</option>
                        {block.options?.map((opt: string, idx: number) => (
                          <option key={idx} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Informativa privacy */}
            {signatureBlocks.length > 0 && (
              <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-gray-700">
                <p className="font-semibold mb-1">Informativa sulla firma digitale:</p>
                <p>
                  La firma registra data/ora locale e UTC, user agent, hash dell'immagine.
                  Nessuna posizione geografica viene raccolta.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Colonna destra: Anteprima */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4">Anteprima Documento</h2>
          
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
            {template && (
              <DocumentRenderer
                template={template}
                data={formData}
                scale={0.6}
                showGrid={false}
                mode="instance"
                signatures={instance?.signEvents.map((se) => ({
                  blockId: se.blockId || "",
                  signaturePngUrl: se.signaturePngUrl || "",
                  signatureHash: se.signatureHash,
                  signedAtLocal: se.signedAtLocal,
                  tz: se.tz,
                })) || []}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

