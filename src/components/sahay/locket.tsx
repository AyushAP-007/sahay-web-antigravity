export function LocketMark({ className = "size-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="locketGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bezelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="50%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
      </defs>
      {/* Outer ambient glow */}
      <circle cx="32" cy="32" r="30" fill="url(#locketGlow)" />
      {/* Precision Instrument Bezel */}
      <rect width="60" height="60" x="2" y="2" rx="20" fill="url(#bezelGrad)" stroke="#1f2c3a" strokeWidth="1.5" />
      {/* Precision ticks */}
      <circle cx="32" cy="32" r="22" stroke="#10b981" strokeWidth="1" strokeDasharray="2 4" opacity="0.4" fill="none" />
      {/* Internal Vault Shield */}
      <path
        d="M32 14 47 20.5v13.5c0 9.8-6.4 16.5-15 19.2C23.4 50.5 17 43.8 17 34V20.5Z"
        fill="#090d10"
        stroke="#34d399"
        strokeWidth="1.5"
      />
      {/* Core Sentinel Beacon */}
      <circle cx="32" cy="33" r="6" fill="#10b981" />
      <circle cx="32" cy="33" r="2.5" fill="#e6edf3" />
    </svg>
  );
}

export function HangingLocket({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 280"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id="chainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <radialGradient id="beaconGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Chain link stem */}
      <path
        d="M110 8c0 18 0 38 0 54"
        stroke="url(#chainGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      {/* Instrument Rings */}
      <circle cx="110" cy="8" r="5" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
      <circle cx="110" cy="66" r="9" fill="#0f172a" stroke="#34d399" strokeWidth="2" />
      
      {/* Outer Shell Housing */}
      <path
        d="M110 78 165 103V149c0 33-22 56-55 65-33-9-55-32-55-65v-46Z"
        fill="#0f172a"
        stroke="#1f2c3a"
        strokeWidth="2"
      />
      
      {/* Inner Cartographic Vault */}
      <path
        d="M110 92 150 111v33c0 23-15 39-40 46-25-7-40-23-40-46v-33Z"
        fill="#090d10"
        stroke="#10b981"
        strokeWidth="1.5"
      />

      {/* Coordinate & Astrolabe Reticle Rings */}
      <circle cx="110" cy="142" r="28" stroke="#10b981" strokeWidth="0.8" strokeDasharray="3 5" opacity="0.5" />
      <circle cx="110" cy="142" r="20" fill="url(#beaconGlow)" />
      
      {/* Luminous Core Jewel */}
      <circle cx="110" cy="142" r="14" fill="#064e3b" stroke="#34d399" strokeWidth="2" />
      <circle cx="110" cy="142" r="6" fill="#10b981" />
      <circle cx="110" cy="142" r="2.5" fill="#ffffff" />
    </svg>
  );
}