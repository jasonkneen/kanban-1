import { useCallback, useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = "(max-width: 768px)";

export function useIsMobile(): boolean {
	const subscribe = useCallback((cb: () => void) => {
		const mql = window.matchMedia(MOBILE_BREAKPOINT);
		mql.addEventListener("change", cb);
		return () => mql.removeEventListener("change", cb);
	}, []);
	const getSnapshot = useCallback(() => window.matchMedia(MOBILE_BREAKPOINT).matches, []);
	const getServerSnapshot = useCallback(() => false, []);
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
