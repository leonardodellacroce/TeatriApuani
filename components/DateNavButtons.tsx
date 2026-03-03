"use client";

type DateNavButtonsProps = {
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  className?: string;
  /** Su mobile, i pulsanti occupano tutta la larghezza disponibile */
  fullWidthOnMobile?: boolean;
};

/**
 * Pulsanti di navigazione data: freccia sinistra, Oggi, freccia destra.
 * Stile uniforme come in Eventi, usato in tutta l'app.
 */
export default function DateNavButtons({ onPrev, onToday, onNext, className = "", fullWidthOnMobile }: DateNavButtonsProps) {
  const btnClass = "w-11 h-11 inline-flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 active:scale-100 transition-all duration-200 cursor-pointer";
  const oggiClass = "px-3 h-11 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 active:scale-100 transition-all duration-200 cursor-pointer";
  const flexClass = fullWidthOnMobile ? "flex-1 md:flex-none min-w-0" : "";

  return (
    <div className={`flex gap-2 flex-shrink-0 ${fullWidthOnMobile ? "w-full md:w-auto" : ""} ${className}`}>
      <button type="button" onClick={onPrev} className={`${btnClass} ${flexClass}`} aria-label="Precedente">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button type="button" onClick={onToday} className={`${oggiClass} ${flexClass}`}>
        Oggi
      </button>
      <button type="button" onClick={onNext} className={`${btnClass} ${flexClass}`} aria-label="Successivo">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
