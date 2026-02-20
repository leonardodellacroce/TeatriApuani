"use client";

import { useRef, useEffect, useState } from "react";
import SignaturePad from "signature_pad";
import { format } from "date-fns";

interface SignatureBlockProps {
  instanceId: string;
  blockId?: string;
  role?: string;
  disabled?: boolean;
  onSigned?: (payload: {
    signaturePngUrl: string;
    signatureHash: string;
    status: string;
  }) => void;
}

export default function SignatureBlock({
  instanceId,
  blockId,
  role,
  disabled = false,
  onSigned,
}: SignatureBlockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signatureData, setSignatureData] = useState<{
    imageUrl: string;
    signedAtLocal: string;
    hash: string;
    tz: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current && !disabled && !signatureData) {
      const canvas = canvasRef.current;
      const pad = new SignaturePad(canvas, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(0, 0, 0)",
      });

      padRef.current = pad;

      // Resize canvas per supportare retina displays
      const resizeCanvas = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d")?.scale(ratio, ratio);
        pad.clear();
      };

      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);

      return () => {
        window.removeEventListener("resize", resizeCanvas);
        pad.off();
      };
    }
  }, [disabled, signatureData]);

  const handleClear = () => {
    if (padRef.current) {
      padRef.current.clear();
      setError(null);
    }
  };

  const handleSign = async () => {
    if (!padRef.current) return;

    if (padRef.current.isEmpty()) {
      setError("Per favore firma nel riquadro prima di procedere");
      return;
    }

    setIsSigning(true);
    setError(null);

    try {
      const imageDataUrl = padRef.current.toDataURL("image/png");
      const signedAtLocal = format(new Date(), "dd/MM/yyyy HH:mm:ss");
      const tz = "Europe/Rome";
      const tzOffsetMinutes = -new Date().getTimezoneOffset();

      const response = await fetch(`/api/docs/instances/${instanceId}/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl,
          signedAtLocal,
          tz,
          tzOffsetMinutes,
          blockId,
          role,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Errore durante la firma");
      }

      const data = await response.json();

      // Salva i dati della firma
      setSignatureData({
        imageUrl: data.signaturePngUrl,
        signedAtLocal,
        hash: data.signatureHash,
        tz,
      });

      // Notifica il parent component
      if (onSigned) {
        onSigned({
          signaturePngUrl: data.signaturePngUrl,
          signatureHash: data.signatureHash,
          status: data.status,
        });
      }
    } catch (err) {
      console.error("Errore firma:", err);
      setError(err instanceof Error ? err.message : "Errore durante la firma");
    } finally {
      setIsSigning(false);
    }
  };

  if (signatureData || disabled) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
        {signatureData && (
          <>
            <div className="mb-3">
              <img
                src={signatureData.imageUrl}
                alt="Firma"
                className="max-w-full h-auto border border-gray-200 bg-white"
                style={{ maxHeight: "120px" }}
              />
            </div>
            <div className="text-sm text-gray-700 space-y-1">
              <div>
                <span className="font-semibold">Firmato il:</span>{" "}
                {signatureData.signedAtLocal} ({signatureData.tz})
              </div>
              <div>
                <span className="font-semibold">Hash:</span>{" "}
                <span className="font-mono text-xs">
                  {signatureData.hash.slice(0, 16)}…
                </span>
              </div>
              {role && (
                <div>
                  <span className="font-semibold">Ruolo:</span> {role}
                </div>
              )}
            </div>
          </>
        )}
        {disabled && !signatureData && (
          <div className="text-sm text-gray-500 italic">
            Area firma {role && `(${role})`}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white">
      <div className="mb-3">
        <canvas
          ref={canvasRef}
          className="border border-gray-300 rounded w-full"
          style={{ minHeight: "120px", maxHeight: "200px", height: "150px" }}
        />
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleClear}
          disabled={isSigning}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancella
        </button>
        <button
          onClick={handleSign}
          disabled={isSigning}
          className="flex-1 px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSigning ? "Firma in corso..." : "Firma e registra"}
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        <p>
          La firma registra data/ora locale e UTC, user agent, hash
          dell'immagine. Nessuna posizione viene raccolta.
        </p>
      </div>
    </div>
  );
}

