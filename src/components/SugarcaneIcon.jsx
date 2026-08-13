import React from 'react';

export default function SugarcaneIcon({ size = 24, strokeWidth = 1.8, className = '', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* Three segmented cane stalks */}
      <path d="M7.8 21V8.3" />
      <path d="M12 21V5.6" />
      <path d="M16.2 21V9.1" />

      {/* Cane nodes */}
      <path d="M6.6 12h2.4M6.6 16h2.4M6.6 19h2.4" />
      <path d="M10.7 9.4h2.6M10.7 13.3h2.6M10.7 17.2h2.6" />
      <path d="M15 12.3h2.4M15 16h2.4M15 19h2.4" />

      {/* Long blade-like sugarcane leaves */}
      <path d="M12 7.1C9.3 6.8 6.3 5 4.1 2.1c3.8.1 6.7 1.4 8 4.7" />
      <path d="M12.3 7C14.2 4.4 17 2.8 20.2 2.4c-.7 3.1-3 5.4-7.8 6" />
      <path d="M16.2 10.6c1.9-1.9 3.7-2.5 5.5-2.1-.7 2.3-2.4 3.9-5.5 4.4" />
      <path d="M7.8 10.4C6 9.3 4.4 9.1 2.7 9.7c1 2 2.6 3.1 5.1 3.2" />

      {/* Ground line */}
      <path d="M4.8 21h14.4" />
    </svg>
  );
}
