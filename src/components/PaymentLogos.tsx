const PaymentLogos = () => {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground mr-1 shrink-0">Pay With</span>

      {/* VISA */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center p-1">
        <svg viewBox="0 0 48 16" className="w-full h-full">
          <text x="2" y="13" fontFamily="Arial" fontWeight="900" fontSize="14" fill="#1A1F71" fontStyle="italic" letterSpacing="-0.5">VISA</text>
        </svg>
      </div>

      {/* Mastercard */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center p-1">
        <svg viewBox="0 0 48 30" className="w-full h-full">
          <circle cx="17" cy="15" r="10" fill="#EB001B" />
          <circle cx="31" cy="15" r="10" fill="#F79E1B" />
          <path d="M24 7.5a10 10 0 0 1 0 15 10 10 0 0 1 0-15z" fill="#FF5F00" />
        </svg>
      </div>

      {/* AMEX */}
      <div className="h-9 w-14 bg-[#007BC1] rounded-md border border-gray-200 shadow-sm flex items-center justify-center">
        <svg viewBox="0 0 56 20" className="w-full h-full px-1">
          <text x="4" y="14" fontFamily="Arial" fontWeight="900" fontSize="11" fill="white" letterSpacing="1">AMEX</text>
        </svg>
      </div>

      {/* UnionPay */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 56 36" className="w-full h-full">
          <rect x="0" y="0" width="18" height="36" fill="#E21836" rx="3" />
          <rect x="19" y="0" width="18" height="36" fill="#00447C" />
          <rect x="38" y="0" width="18" height="36" fill="#007B40" rx="3" />
          <text x="9" y="22" fontFamily="Arial" fontWeight="900" fontSize="9" fill="white" textAnchor="middle">UP</text>
          <text x="28" y="22" fontFamily="Arial" fontWeight="900" fontSize="7" fill="white" textAnchor="middle">银联</text>
          <text x="47" y="22" fontFamily="Arial" fontWeight="900" fontSize="6" fill="white" textAnchor="middle">UP</text>
        </svg>
      </div>

      {/* Diners Club */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center p-1">
        <svg viewBox="0 0 48 30" className="w-full h-full">
          <circle cx="24" cy="15" r="13" fill="none" stroke="#004A97" strokeWidth="2" />
          <circle cx="18" cy="15" r="8" fill="#004A97" />
          <circle cx="30" cy="15" r="8" fill="none" stroke="#004A97" strokeWidth="1.5" />
        </svg>
      </div>

      {/* DBBL Nexus */}
      <div className="h-9 w-16 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center p-1">
        <svg viewBox="0 0 64 24" className="w-full h-full">
          <text x="2" y="17" fontFamily="Arial" fontWeight="900" fontSize="10" fill="#004B87">DBBL</text>
          <text x="2" y="26" fontFamily="Arial" fontSize="7" fill="#E41E2B">NEXUS</text>
        </svg>
      </div>

      {/* bKash */}
      <div className="h-9 w-14 bg-[#E2136E] rounded-md border border-gray-200 shadow-sm flex items-center justify-center">
        <svg viewBox="0 0 56 24" className="w-full h-full px-1">
          <text x="4" y="17" fontFamily="Arial" fontWeight="900" fontSize="12" fill="white">bKash</text>
        </svg>
      </div>

      {/* Nagad */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 56 36" className="w-full h-full">
          <rect width="56" height="36" fill="#F6A724" />
          <text x="28" y="23" fontFamily="Arial" fontWeight="900" fontSize="13" fill="white" textAnchor="middle">নগদ</text>
        </svg>
      </div>

      {/* Rocket */}
      <div className="h-9 w-14 bg-[#8B1D8B] rounded-md border border-gray-200 shadow-sm flex items-center justify-center">
        <svg viewBox="0 0 56 24" className="w-full h-full px-1">
          <text x="4" y="17" fontFamily="Arial" fontWeight="900" fontSize="10" fill="white">Rocket</text>
        </svg>
      </div>

      {/* Upay */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 56 36" className="w-full h-full">
          <rect width="56" height="36" fill="#6C2D91" />
          <text x="28" y="24" fontFamily="Arial" fontWeight="900" fontSize="13" fill="white" textAnchor="middle">Upay</text>
        </svg>
      </div>

      {/* MyCash */}
      <div className="h-9 w-16 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 64 36" className="w-full h-full">
          <rect width="64" height="36" fill="#00843D" />
          <text x="32" y="24" fontFamily="Arial" fontWeight="900" fontSize="11" fill="white" textAnchor="middle">MyCash</text>
        </svg>
      </div>

      {/* FastCash */}
      <div className="h-9 w-16 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 64 36" className="w-full h-full">
          <rect width="64" height="36" fill="#E41E2B" />
          <text x="32" y="24" fontFamily="Arial" fontWeight="900" fontSize="10" fill="white" textAnchor="middle">FastCash</text>
        </svg>
      </div>

      {/* City Bank */}
      <div className="h-9 w-16 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 64 36" className="w-full h-full">
          <rect width="64" height="18" fill="#C8102E" />
          <rect y="18" width="64" height="18" fill="#003087" />
          <text x="32" y="13" fontFamily="Arial" fontWeight="900" fontSize="9" fill="white" textAnchor="middle">CITY</text>
          <text x="32" y="28" fontFamily="Arial" fontWeight="900" fontSize="9" fill="white" textAnchor="middle">BANK</text>
        </svg>
      </div>

      {/* BRAC Bank */}
      <div className="h-9 w-16 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 64 36" className="w-full h-full">
          <rect width="64" height="36" fill="#fff" />
          <text x="32" y="14" fontFamily="Arial" fontWeight="900" fontSize="10" fill="#E41E2B" textAnchor="middle">BRAC</text>
          <text x="32" y="28" fontFamily="Arial" fontWeight="900" fontSize="9" fill="#003087" textAnchor="middle">BANK</text>
        </svg>
      </div>

      {/* AB Bank */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 56 36" className="w-full h-full">
          <rect width="56" height="36" fill="#003087" />
          <text x="28" y="15" fontFamily="Arial" fontWeight="900" fontSize="11" fill="white" textAnchor="middle">AB+</text>
          <text x="28" y="28" fontFamily="Arial" fontSize="7" fill="#F6A724" textAnchor="middle">BANK</text>
        </svg>
      </div>

      {/* MTB */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 56 36" className="w-full h-full">
          <rect width="56" height="36" fill="#E41E2B" />
          <text x="28" y="15" fontFamily="Arial" fontWeight="900" fontSize="13" fill="white" textAnchor="middle">MTB</text>
          <text x="28" y="28" fontFamily="Arial" fontSize="7" fill="white" textAnchor="middle">BANK</text>
        </svg>
      </div>

      {/* EBL */}
      <div className="h-9 w-14 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 56 36" className="w-full h-full">
          <rect width="56" height="36" fill="#00843D" />
          <text x="28" y="24" fontFamily="Arial" fontWeight="900" fontSize="16" fill="white" textAnchor="middle">EBL</text>
        </svg>
      </div>

      {/* Sonali Bank */}
      <div className="h-9 w-16 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 64 36" className="w-full h-full">
          <rect width="64" height="36" fill="#00843D" />
          <text x="32" y="15" fontFamily="Arial" fontWeight="900" fontSize="9" fill="white" textAnchor="middle">SONALI</text>
          <text x="32" y="28" fontFamily="Arial" fontWeight="900" fontSize="9" fill="#F6A724" textAnchor="middle">BANK</text>
        </svg>
      </div>

      {/* Agrani Bank */}
      <div className="h-9 w-16 bg-white rounded-md border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 64 36" className="w-full h-full">
          <rect width="64" height="36" fill="#003087" />
          <text x="32" y="15" fontFamily="Arial" fontWeight="900" fontSize="9" fill="white" textAnchor="middle">AGRANI</text>
          <text x="32" y="28" fontFamily="Arial" fontWeight="900" fontSize="9" fill="#F6A724" textAnchor="middle">BANK</text>
        </svg>
      </div>
    </div>
  );
};

export default PaymentLogos;
