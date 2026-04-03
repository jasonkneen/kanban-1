/** Type declaration for the kanban/runtime-start subpath export. */
declare module "kanban/runtime-start" {
	export interface RuntimeCallbacks {
		pickDirectory?: () => Promise<string | null>;
		warn?: (message: string) => void;
	}
	export interface RuntimeStartOptions {
		host?: string;
		port?: number | "auto";
		authToken?: string;
		cwd?: string;
		isLocal?: boolean;
		openInBrowser?: boolean;
		callbacks?: RuntimeCallbacks;
		directoryBrowseRoot?: string;
	}
	/** @deprecated Use {@link RuntimeStartOptions} instead. */
	export type RuntimeOptions = RuntimeStartOptions;
	export interface RuntimeHandle {
		url: string;
		shutdown: (options?: { skipSessionCleanup?: boolean }) => Promise<void>;
	}
	export function startRuntime(options?: RuntimeStartOptions): Promise<RuntimeHandle>;
}

/** Type declaration for the kanban package. */
declare module "kanban" {
	export function listWorkspaceIndexEntries(): Promise<Array<{ repoPath: string }>>;
	export function loadWorkspaceState(repoPath: string): Promise<{
		board: {
			columns: Array<{
				id: string;
				cards: Array<{ id: string }>;
			}>;
		};
	}>;
}
