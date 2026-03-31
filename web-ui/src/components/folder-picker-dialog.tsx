import { ArrowLeft, ChevronRight, Folder, FolderOpen, FolderPlus, GitBranch, Home, Plus } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { getRuntimeTrpcClient } from "@/runtime/trpc-client";

// ── Types ──────────────────────────────────────────────────────────────────

interface FolderEntry {
	name: string;
	path: string;
}

type GitSetupStep = "none" | "prompt" | "clone-input";

interface FolderPickerDialogProps {
	open: boolean;
	currentProjectId: string | null;
	onSelect: (path: string) => void;
	onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function FolderPickerDialog({
	open,
	currentProjectId,
	onSelect,
	onCancel,
}: FolderPickerDialogProps): React.ReactElement {
	// ── Browser state ────────────────────────────────────────────────────
	const [currentPath, setCurrentPath] = useState<string>("");
	const [entries, setEntries] = useState<FolderEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [history, setHistory] = useState<string[]>([]);

	// ── Create folder state ───────────────────────────────────────────────
	const [isCreating, setIsCreating] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");
	const [createError, setCreateError] = useState<string | null>(null);
	const [isCreateLoading, setIsCreateLoading] = useState(false);

	// ── Git setup state ───────────────────────────────────────────────────
	// After the user selects a folder with no git repo, we show options.
	const [gitSetupStep, setGitSetupStep] = useState<GitSetupStep>("none");
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [cloneUrl, setCloneUrl] = useState("");
	const [gitActionLoading, setGitActionLoading] = useState(false);
	const [gitError, setGitError] = useState<string | null>(null);

	const newFolderInputId = useId();
	const cloneUrlInputId = useId();

	// ── Navigation ────────────────────────────────────────────────────────

	const navigate = useCallback(
		async (path: string, addToHistory = true) => {
			setIsLoading(true);
			setError(null);
			setIsCreating(false);
			setNewFolderName("");
			setCreateError(null);
			try {
				const trpcClient = getRuntimeTrpcClient(currentProjectId);
				const result = await trpcClient.projects.listDirectory.query({ path });
				if (result.error) {
					setError(result.error);
				} else {
					if (addToHistory && currentPath) {
						setHistory((h) => [...h, currentPath]);
					}
					setCurrentPath(result.path);
					setEntries(result.entries);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setIsLoading(false);
			}
		},
		[currentProjectId, currentPath],
	);

	// Load home directory when dialog opens
	useEffect(() => {
		if (open) {
			setHistory([]);
			setGitSetupStep("none");
			setSelectedPath(null);
			setCloneUrl("");
			setGitError(null);
			setIsCreating(false);
			void navigate("~", false);
		}
		// navigate is intentionally excluded
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const handleBack = useCallback(() => {
		const prev = history[history.length - 1];
		if (!prev) return;
		setHistory((h) => h.slice(0, -1));
		void navigate(prev, false);
	}, [history, navigate]);

	// ── Create folder ─────────────────────────────────────────────────────

	const handleCreateFolder = useCallback(async () => {
		const name = newFolderName.trim();
		if (!name || !currentPath) return;
		setIsCreateLoading(true);
		setCreateError(null);
		try {
			const trpcClient = getRuntimeTrpcClient(currentProjectId);
			const sep = currentPath.includes("/") ? "/" : "\\";
			const newPath = `${currentPath}${sep}${name}`;
			const result = await trpcClient.projects.createDirectory.mutate({ path: newPath });
			if (!result.ok || !result.path) {
				setCreateError(result.error ?? "Failed to create folder.");
				return;
			}
			// Navigate into the newly created folder.
			await navigate(result.path);
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsCreateLoading(false);
		}
	}, [currentPath, currentProjectId, navigate, newFolderName]);

	const handleNewFolderKeyDown = useCallback(
		(e: KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") void handleCreateFolder();
			if (e.key === "Escape") {
				setIsCreating(false);
				setNewFolderName("");
				setCreateError(null);
			}
		},
		[handleCreateFolder],
	);

	// ── Selection + git setup ─────────────────────────────────────────────

	// Called when user clicks "Select Folder" or a folder with no git repo.
	const handleSelect = useCallback(
		(path: string) => {
			// Try adding — if no git repo, the hook sets pendingGitInitializationPath.
			// We intercept here by always prompting for git setup when no repo found.
			// The parent onSelect will call addProjectByPath which handles requiresGitInitialization.
			// For simplicity, we always pass through and let the existing flow handle it.
			onSelect(path);
		},
		[onSelect],
	);

	// ── Git clone ─────────────────────────────────────────────────────────

	const handleClone = useCallback(async () => {
		if (!cloneUrl.trim() || !currentPath) return;
		setGitActionLoading(true);
		setGitError(null);
		try {
			const trpcClient = getRuntimeTrpcClient(currentProjectId);
			const result = await trpcClient.projects.cloneRepository.mutate({
				url: cloneUrl.trim(),
				parentPath: currentPath,
			});
			if (!result.ok || !result.path) {
				setGitError(result.error ?? "Clone failed.");
				return;
			}
			// Navigate into the cloned repo so the user can see it, then select it.
			onSelect(result.path);
		} catch (err) {
			setGitError(err instanceof Error ? err.message : String(err));
		} finally {
			setGitActionLoading(false);
		}
	}, [cloneUrl, currentPath, currentProjectId, onSelect]);

	// ── Breadcrumb ────────────────────────────────────────────────────────

	const segments = currentPath ? currentPath.replace(/\\/g, "/").split("/").filter(Boolean) : [];

	// ── Render ────────────────────────────────────────────────────────────

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) onCancel();
			}}
			contentClassName="max-w-xl"
			contentAriaDescribedBy="folder-picker-desc"
		>
			<DialogHeader title="Select Project Folder" />

			<DialogBody>
				<div id="folder-picker-desc" className="flex flex-col gap-3">
					{/* Breadcrumb */}
					<div className="flex min-h-6 flex-wrap items-center gap-1 text-xs text-text-secondary">
						<button
							type="button"
							className="flex items-center gap-1 transition-colors hover:text-text-primary"
							onClick={() => {
								setHistory((h) => (currentPath ? [...h, currentPath] : h));
								void navigate("~", false);
							}}
						>
							<Home size={12} />
						</button>
						{segments.map((seg, i) => {
							const segPath = currentPath.includes("/")
								? `/${segments.slice(0, i + 1).join("/")}`
								: segments.slice(0, i + 1).join("\\");
							return (
								<span key={segPath} className="flex items-center gap-1">
									<ChevronRight size={12} className="shrink-0 text-text-tertiary" />
									<button
										type="button"
										className={cn(
											"max-w-[120px] truncate transition-colors hover:text-text-primary",
											i === segments.length - 1 && "font-medium text-text-primary",
										)}
										onClick={() => {
											setHistory((h) => (currentPath ? [...h, currentPath] : h));
											void navigate(segPath, false);
										}}
									>
										{seg}
									</button>
								</span>
							);
						})}
					</div>

					{/* Clone URL input (shown when git setup step is clone-input) */}
					{gitSetupStep === "clone-input" ? (
						<div className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-3">
							<p className="text-[13px] text-text-secondary">
								Enter a Git repository URL to clone into{" "}
								<span className="font-mono text-text-primary">{currentPath.split(/[\\/]/).pop()}</span>:
							</p>
							<input
								id={cloneUrlInputId}
								type="text"
								value={cloneUrl}
								onChange={(e) => setCloneUrl(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") void handleClone();
									if (e.key === "Escape") setGitSetupStep("none");
								}}
								placeholder="https://github.com/org/repo.git"
								autoFocus
								disabled={gitActionLoading}
								className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none disabled:opacity-50"
							/>
							{gitError ? <p className="text-[12px] text-status-red">{gitError}</p> : null}
							<div className="flex gap-2">
								<Button
									variant="default"
									size="sm"
									onClick={() => {
										setGitSetupStep("none");
										setGitError(null);
									}}
									disabled={gitActionLoading}
								>
									Cancel
								</Button>
								<Button
									variant="primary"
									size="sm"
									disabled={!cloneUrl.trim() || gitActionLoading}
									icon={gitActionLoading ? <Spinner size={12} /> : <GitBranch size={12} />}
									onClick={() => void handleClone()}
								>
									{gitActionLoading ? "Cloning…" : "Clone"}
								</Button>
							</div>
						</div>
					) : null}

					{/* Folder list */}
					<div className="flex flex-col overflow-hidden rounded-md border border-border bg-surface-2">
						{history.length > 0 ? (
							<button
								type="button"
								className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-3"
								onClick={handleBack}
							>
								<ArrowLeft size={14} className="shrink-0" />
								<span>Back</span>
							</button>
						) : null}

						{isLoading ? (
							<div className="flex items-center justify-center py-10">
								<Spinner size={20} />
							</div>
						) : error ? (
							<div className="px-4 py-6 text-center text-sm text-status-red">{error}</div>
						) : (
							<div className="max-h-64 overflow-y-auto">
								{entries.map((entry) => (
									<button
										key={entry.path}
										type="button"
										className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-sm text-text-primary transition-colors last:border-b-0 hover:bg-surface-3"
										onClick={() => void navigate(entry.path)}
									>
										<Folder size={14} className="shrink-0 text-status-gold" />
										<span className="truncate text-left">{entry.name}</span>
										<ChevronRight size={12} className="ml-auto shrink-0 text-text-tertiary" />
									</button>
								))}
								{entries.length === 0 && !isCreating ? (
									<div className="px-4 py-4 text-center text-sm text-text-tertiary">No subfolders found.</div>
								) : null}

								{/* Create folder inline row */}
								{isCreating ? (
									<div className="border-t border-border px-3 py-2">
										<div className="flex items-center gap-2">
											<FolderPlus size={14} className="shrink-0 text-accent" />
											<input
												id={newFolderInputId}
												type="text"
												value={newFolderName}
												onChange={(e) => setNewFolderName(e.target.value)}
												onKeyDown={handleNewFolderKeyDown}
												placeholder="New folder name…"
												autoFocus
												disabled={isCreateLoading}
												className="flex-1 rounded border border-border bg-surface-3 px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
											/>
											<Button
												variant="primary"
												size="sm"
												disabled={!newFolderName.trim() || isCreateLoading}
												icon={isCreateLoading ? <Spinner size={12} /> : undefined}
												onClick={() => void handleCreateFolder()}
											>
												Create
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													setIsCreating(false);
													setNewFolderName("");
													setCreateError(null);
												}}
											>
												Cancel
											</Button>
										</div>
										{createError ? <p className="mt-1 text-[12px] text-status-red">{createError}</p> : null}
									</div>
								) : null}
							</div>
						)}
					</div>

					{/* Create folder trigger (shown when not already creating) */}
					{!isCreating && !isLoading && !error && currentPath ? (
						<button
							type="button"
							className="flex items-center gap-1.5 text-xs text-text-tertiary transition-colors hover:text-accent"
							onClick={() => setIsCreating(true)}
						>
							<Plus size={12} />
							<span>Create folder here</span>
						</button>
					) : null}

					{/* Current selection */}
					{currentPath ? (
						<div className="flex items-center gap-2 rounded-md border border-border bg-surface-0 px-3 py-2">
							<FolderOpen size={14} className="shrink-0 text-status-gold" />
							<span className="truncate font-mono text-xs text-text-secondary">{currentPath}</span>
						</div>
					) : null}
				</div>
			</DialogBody>

			<DialogFooter>
				<div className="flex flex-1 items-center gap-2">
					{/* Clone repo shortcut */}
					{currentPath && gitSetupStep === "none" ? (
						<Button
							variant="ghost"
							size="sm"
							icon={<GitBranch size={13} />}
							onClick={() => {
								setGitSetupStep("clone-input");
								setCloneUrl("");
								setGitError(null);
							}}
						>
							Clone repo here
						</Button>
					) : null}
				</div>
				<Button variant="default" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					variant="primary"
					disabled={!currentPath || isLoading}
					onClick={() => {
						if (currentPath) handleSelect(currentPath);
					}}
				>
					Select Folder
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
