export function LocketMark({ className = "size-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#176d60" />
      <path
        d="M32 10.5 49 18v15.4c0 10.8-7.1 18.2-17 21.2C22.1 51.6 15 44.2 15 33.4V18Z"
        fill="#f6f4ee"
      />
      <circle cx="32" cy="32.5" r="7" fill="#854c3d" />
      <circle cx="32" cy="32.5" r="3.2" fill="#f6e7df" />
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
      <path
        d="M110 8c0 18 0 38 0 54"
        stroke="#31574f"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="110" cy="8" r="5" fill="#176d60" />
      <circle cx="110" cy="66" r="8" fill="#176d60" />
      <path
        d="M110 78 162 102.5V148c0 32-21 54-52 63-31-9-52-31-52-63v-45.5Z"
        fill="#176d60"
      />
      <path
        d="M110 92 148 110v32c0 22-14.5 37.5-38 44.5-23.5-7-38-22.5-38-44.5v-32Z"
        fill="#f6f4ee"
      />
      <circle cx="110" cy="142" r="16" fill="#854c3d" />
      <circle cx="110" cy="142" r="7" fill="#f6e7df" />
    </svg>
  );
}
