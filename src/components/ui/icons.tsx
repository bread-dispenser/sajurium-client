import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const HomeIcon = (props: IconProps) => <Svg {...props}><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" /></Svg>;
export const ChartIcon = (props: IconProps) => <Svg {...props}><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="10" y="4" width="4" height="16" rx="1" /><rect x="17" y="4" width="4" height="16" rx="1" /></Svg>;
export const ConsultIcon = (props: IconProps) => <Svg {...props}><path d="M5 18l-1 3 4-2h9a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v9" /></Svg>;
export const PairIcon = (props: IconProps) => <Svg {...props}><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></Svg>;
export const ArchiveIcon = (props: IconProps) => <Svg {...props}><path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M3 4h18v3H3z" /><path d="M10 11h4" /></Svg>;
export const BellIcon = (props: IconProps) => <Svg {...props}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></Svg>;
export const SettingsIcon = (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></Svg>;
export const BackIcon = (props: IconProps) => <Svg strokeWidth={1.8} {...props}><path d="M15 5l-7 7 7 7" /></Svg>;
export const ChevronIcon = (props: IconProps) => <Svg size={18} strokeWidth={1.8} {...props}><path d="M9 5l7 7-7 7" /></Svg>;
export const InfoIcon = (props: IconProps) => <Svg size={18} strokeWidth={1.8} {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16v.5" /></Svg>;
export const ShareIcon = (props: IconProps) => <Svg size={20} strokeWidth={1.8} {...props}><path d="M12 3v12" /><path d="M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></Svg>;
export const SendIcon = (props: IconProps) => <Svg size={20} strokeWidth={2} {...props}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const PlusIcon = (props: IconProps) => <Svg size={20} strokeWidth={1.8} {...props}><path d="M12 5v14M5 12h14" /></Svg>;
export const CheckIcon = (props: IconProps) => <Svg size={18} strokeWidth={2} {...props}><path d="M5 12l5 5 9-10" /></Svg>;
export const LockIcon = (props: IconProps) => <Svg size={16} strokeWidth={1.8} {...props}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
