import React from 'react';

export const SeekBackward10: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Circular arrow pointing backwards (counter-clockwise) */}
    <path d="M12 3.5 C6.8 3.5 3.5 7.8 3 12.2 C2.5 16.5 5.5 20.5 10 21" />
    <polyline points="5.5 2 2.5 5 6 7.5" />
    {/* "10" centered inside */}
    <text
      x="12.5"
      y="15.2"
      fill="currentColor"
      stroke="none"
      fontSize="8.5"
      fontWeight="700"
      fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
      textAnchor="middle"
    >
      10
    </text>
  </svg>
);

export const SeekForward10: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Circular arrow pointing forwards (clockwise) */}
    <path d="M12 3.5 C17.2 3.5 20.5 7.8 21 12.2 C21.5 16.5 18.5 20.5 14 21" />
    <polyline points="18.5 2 21.5 5 18 7.5" />
    {/* "10" centered inside */}
    <text
      x="11.5"
      y="15.2"
      fill="currentColor"
      stroke="none"
      fontSize="8.5"
      fontWeight="700"
      fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
      textAnchor="middle"
    >
      10
    </text>
  </svg>
);
