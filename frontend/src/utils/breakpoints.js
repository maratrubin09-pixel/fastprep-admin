export const MOBILE_MAX = 768;
export const TABLET_MAX = 1024;
export const DESKTOP_MIN = 1025;

export const isMobile = () => typeof window !== 'undefined' && window.innerWidth < MOBILE_MAX;
export const isTablet = () => typeof window !== 'undefined' && window.innerWidth >= MOBILE_MAX && window.innerWidth < TABLET_MAX;
export const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;

