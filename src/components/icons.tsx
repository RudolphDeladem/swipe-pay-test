import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 24): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});
const make = (paths: ReactNode) =>
  function Icon({ size, ...rest }: P) {
    return (
      <svg {...base(size)} {...rest}>
        {paths}
      </svg>
    );
  };

export const Bell = make(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>);
export const Eye = make(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const EyeOff = make(<><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" /><path d="M6.6 6.6A13.5 13.5 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="m2 2 20 20" /></>);
export const ShieldCheck = make(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>);
export const Send = make(<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>);
export const ScanQr = make(<><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="7" y="7" width="4" height="4" rx="1" /><rect x="13" y="7" width="4" height="4" rx="1" /><rect x="7" y="13" width="4" height="4" rx="1" /><path d="M13 13h4v4" /></>);
export const Plus = make(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const Wallet = make(<><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M3 7h16a2 2 0 0 1 2 2v2h-4a2 2 0 0 0 0 4h4" /></>);
export const ChevronRight = make(<path d="m9 18 6-6-6-6" />);
export const ChevronLeft = make(<path d="m15 18-6-6 6-6" />);
export const Home = make(<><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" /></>);
export const Activity = make(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h4" /></>);
export const User = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const Search = make(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>);
export const Nfc = make(<><path d="M6 8.3a6 6 0 0 1 0 7.4" /><path d="M9.5 6a10 10 0 0 1 0 12" /><path d="M13 4a14 14 0 0 1 0 16" /><path d="M2.5 10.5a2 2 0 0 1 0 3" /></>);
export const Pencil = make(<><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>);
export const Backspace = make(<><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="m18 9-6 6" /><path d="m12 9 6 6" /></>);
export const Lock = make(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /><circle cx="12" cy="16" r="1.2" /></>);
export const Check = make(<path d="M20 6 9 17l-5-5" />);
export const Copy = make(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>);
export const Share = make(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4" /><path d="m15.4 6.5-6.8 4" /></>);
export const LogOut = make(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>);
export const Smartphone = make(<><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>);
export const ArrowDownLeft = make(<><path d="M17 7 7 17" /><path d="M17 17H7V7" /></>);
export const ArrowUpRight = make(<><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>);
export const Gift = make(<><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>);
export const Info = make(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>);
export const Trash = make(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>);
export const Tag = make(<><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></>);
export const X = make(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
