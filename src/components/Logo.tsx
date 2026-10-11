/** Inline fried-egg logo (same as public/favicon.svg) — on hover the bacon bonks its head and the egg squints (CSS in index.css: .logo-*) */
export function Logo({ size = 84 }: { size?: number }) {
  return (
    <svg className="logo" viewBox="0 0 200 200" width={size} height={size} aria-hidden>
      <ellipse cx="100" cy="182" rx="24" ry="4" fill="#000" opacity="0.12" />
      <g className="logo-egg">
        <circle cx="100" cy="110" r="50" fill="#FFFDF5" stroke="#2A0F08" strokeWidth="5" />
        <path d="M138,92 A44,44 0 0 1 104,154 A50,50 0 0 0 138,92 Z" fill="#E8E4DA" />
        <g className="logo-eyes-open">
          <ellipse cx="63" cy="113" rx="3.6" ry="4" fill="#2A0F08" />
          <ellipse cx="137" cy="113" rx="3.6" ry="4" fill="#2A0F08" />
        </g>
        {/* squinting eyes > < */}
        <g className="logo-eyes-squint" fill="none" stroke="#2A0F08" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M57,107 L67,113 L57,119" />
          <path d="M143,107 L133,113 L143,119" />
        </g>
        <circle cx="100" cy="104" r="22" fill="#FFC800" stroke="#2A0F08" strokeWidth="4" />
        <ellipse cx="93" cy="97" rx="10" ry="7" fill="#FFE36B" opacity="0.9" />
        <circle cx="90" cy="94" r="3" fill="#fff" />
      </g>
      {/* dizzy stars when bonked */}
      <g className="logo-pow" fill="#FFC800" stroke="#2A0F08" strokeWidth="3" strokeLinejoin="round">
        <path d="M70,52 l4,9 9,1 -7,6 2,9 -8,-5 -8,5 2,-9 -7,-6 9,-1 Z" />
      </g>
      <g className="logo-bacon">
        <g transform="translate(110 46) rotate(32 25 11)">
          <path
            d="M0,4 Q12.5,-3 25,4 T50,4 L50,18 Q37.5,11 25,18 T0,18 Z"
            fill="#E0675E"
            stroke="#2A0F08"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M3,9 Q14,4 25,9.5 T47,9.5" fill="none" stroke="#FFE5C4" strokeWidth="3" strokeLinecap="round" />
          <path d="M4,14.5 Q14,10 25,14.5 T46,14.5" fill="none" stroke="#933D3C" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
