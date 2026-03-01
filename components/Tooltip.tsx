"use client";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  /** Allineamento: "center" (sopra, centrato) o "left" (sopra, allineato a sinistra) */
  align?: "center" | "left";
  className?: string;
}

/**
 * Tooltip custom allineato allo stile dell'app (bg-gray-900, text-white, rounded-lg, shadow-lg).
 * Mostra il contenuto al passaggio del mouse.
 */
export default function Tooltip({ content, children, align = "center", className = "" }: TooltipProps) {
  return (
    <div className={`relative inline-flex group ${className}`}>
      {children}
      <div
        className={`absolute bottom-full mb-2 hidden group-hover:block p-2.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-[100] whitespace-nowrap pointer-events-none ${
          align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
        }`}
      >
        {content}
        <div
          className={`absolute top-full w-0 h-0 border-l-transparent border-r-transparent border-t-gray-900 border-l-[3px] border-r-[3px] border-t-[3px] ${
            align === "center" ? "left-1/2 -translate-x-1/2" : "left-3"
          }`}
        />
      </div>
    </div>
  );
}
