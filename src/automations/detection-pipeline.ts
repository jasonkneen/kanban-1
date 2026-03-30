/**
 * DetectionPipeline — orchestrates evidence collection and rule evaluation.
 *
 * For each active automation agent instance, the pipeline:
 *   1. Loads the template and resolves the policy.
 *   2. Determines which evidence collectors are needed for the active rules.
 *   3. Runs all required collectors in parallel.
 *   4. Runs each rule evaluator and merges the raw findings.
 *   5. Deduplicates and computes fingerprints.
 *   6. Returns enriched AutomationFinding[] to the AutomationService.
 *
 * The pipeline is read-only: it never writes to the board or store.
 * The AutomationService handles persistence and action execution.
 */
import { createHash, randomUUID } from "node:crypto";
import type { RuntimeBoardCard, RuntimeTaskSessionSummary } from "../core/api-contract";
import type { AutomationAgentInstance, AutomationFinding, RawFinding, ResolvedPolicy } from "./automation-types";
import { collectEvidence, getRequiredCollectorIds } from "./evidence-collectors";
import { resolvePolicy } from "./policy-resolver";
import { ruleCatalog } from "./rule-catalog";
import { templateRegistry } from "./template-registry";

// ---------------------------------------------------------------------------
// BoardState passed to the pipeline
// ---------------------------------------------------------------------------

export interface PipelineBoardState {
	cards: RuntimeBoardCard[];
	sessions: Record<string, RuntimeTaskSessionSummary>;
}

// ---------------------------------------------------------------------------
// PipelineResult
// ---------------------------------------------------------------------------

export interface PipelineResult {
	instanceId: string;
	projectPath: string;
	findings: AutomationFinding[];
	rawFindingsCount: number;
	policy: ResolvedPolicy;
	/** Evidence gathered during the scan (projectPath → key → value). */
	evidence: Map<string, Map<string, string>>;
	/** Errors that occurred during evidence collection or rule evaluation. */
	errors: string[];
}

// ---------------------------------------------------------------------------
// DetectionPipeline
// ---------------------------------------------------------------------------

export class DetectionPipeline {
	/**
	 * Run the detection pipeline for one instance and one project.
	 *
	 * @param instance     - The agent instance to run.
	 * @param projectPath  - Absolute path to the project repository.
	 * @param boardState   - Current board state snapshot (or null if unavailable).
	 * @param lastScanAt   - Unix ms of the last completed scan (or null if never).
	 * @returns            - PipelineResult with enriched findings.
	 */
	async run(
		instance: AutomationAgentInstance,
		projectPath: string,
		boardState: PipelineBoardState | null,
		lastScanAt: number | null,
	): Promise<PipelineResult> {
		const errors: string[] = [];

		// 1. Resolve template and policy.
		const template = templateRegistry.getTemplate(instance.templateId);
		if (!template) {
			return {
				instanceId: instance.id,
				projectPath,
				findings: [],
				rawFindingsCount: 0,
				policy: {} as ResolvedPolicy,
				evidence: new Map<string, Map<string, string>>(),
				errors: [`Template "${instance.templateId}" is not registered.`],
			};
		}

		const policy = resolvePolicy(template, instance);

		// 2. Determine which rules to run.
		const ruleIds = template.ruleIds.filter((ruleId) => ruleCatalog.hasRule(ruleId));
		if (ruleIds.length === 0) {
			return {
				instanceId: instance.id,
				projectPath,
				findings: [],
				rawFindingsCount: 0,
				policy,
				evidence: new Map<string, Map<string, string>>(),
				errors: [`No registered rules for template "${instance.templateId}".`],
			};
		}

		// 3. Determine required collectors.
		const requiredCollectorIds = getRequiredCollectorIds(ruleIds);

		// 4. Run evidence collectors in parallel.
		const evidenceMap = await collectEvidence(requiredCollectorIds, {
			projectPath,
			lastScanAt,
			boardState,
		});

		// 5. Build evidence-by-project map for the result.
		const evidenceByProject = new Map<string, Map<string, string>>();
		evidenceByProject.set(projectPath, evidenceMap);

		// 6. Run all rule evaluators.
		const allRawFindings: RawFinding[] = [];
		for (const ruleId of ruleIds) {
			const evaluator = ruleCatalog.getEvaluator(ruleId);
			if (!evaluator) {
				continue;
			}

			try {
				const ruleFindings = await evaluator.evaluate({
					projectPath,
					evidence: evidenceMap,
					boardState: boardState ?? { cards: [], sessions: {} },
				});
				allRawFindings.push(...ruleFindings);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				errors.push(`Rule "${ruleId}" evaluation failed: ${msg}`);
			}

			// Respect per-scan finding limit.
			if (allRawFindings.length >= policy.maxFindingsPerScan) {
				allRawFindings.splice(policy.maxFindingsPerScan);
				break;
			}
		}

		// 7. Enrich raw findings into AutomationFinding objects.
		const now = Date.now();
		const findings: AutomationFinding[] = allRawFindings.map((raw) => {
			const fingerprint = computeFingerprint(instance.id, raw.ruleId, projectPath, raw.fingerprintVars);

			return {
				id: randomUUID(),
				fingerprint,
				instanceId: instance.id,
				templateId: instance.templateId,
				projectPath,
				ruleId: raw.ruleId,
				category: getRuleCategory(raw.ruleId),
				severity: raw.severity,
				status: "open",
				title: raw.title,
				description: raw.description,
				affectedFiles: raw.affectedFiles,
				evidence: raw.evidence,
				firstSeenAt: now,
				lastSeenAt: now,
				linkedTaskId: null,
			};
		});

		return {
			instanceId: instance.id,
			projectPath,
			findings,
			rawFindingsCount: allRawFindings.length,
			policy,
			evidence: evidenceByProject,
			errors,
		};
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a stable fingerprint for a finding.
 * The fingerprint identifies the same logical issue across scans.
 */
function computeFingerprint(
	instanceId: string,
	ruleId: string,
	projectPath: string,
	vars: Record<string, string>,
): string {
	const key = JSON.stringify({ instanceId, ruleId, projectPath, ...vars });
	return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/**
 * Get the category for a rule ID.  Falls back to the rule ID itself.
 */
function getRuleCategory(ruleId: string): string {
	const evaluator = ruleCatalog.getEvaluator(ruleId);
	return evaluator?.rule.category ?? ruleId;
}

/** Singleton pipeline — shared across the process. */
export const detectionPipeline = new DetectionPipeline();
