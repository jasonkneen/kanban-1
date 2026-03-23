import { describe, expect, it } from "vitest";
import { sanitizeMcpToolName } from "../../../src/cline-sdk/sdk-provider-boundary.js";

const API_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

describe("sanitizeMcpToolName", () => {
	it("passes through already-valid names unchanged", () => {
		const result = sanitizeMcpToolName({ serverName: "my-server", toolName: "list_tools" });
		expect(result).toBe("my-server__list_tools");
		expect(result).toMatch(API_NAME_PATTERN);
	});

	it("replaces dots in server names with underscores", () => {
		const result = sanitizeMcpToolName({ serverName: "github.com", toolName: "search" });
		expect(result).toBe("github_com__search");
		expect(result).toMatch(API_NAME_PATTERN);
	});

	it("replaces slashes in server names with underscores", () => {
		const result = sanitizeMcpToolName({
			serverName: "github.com/cline/linear-mcp",
			toolName: "linear_create_issue",
		});
		expect(result).toBe("github_com_cline_linear-mcp__linear_create_issue");
		expect(result).toMatch(API_NAME_PATTERN);
	});

	it("replaces spaces and special characters", () => {
		const result = sanitizeMcpToolName({ serverName: "My Server (v2)", toolName: "do stuff!" });
		expect(result).toBe("My_Server__v2___do_stuff_");
		expect(result).toMatch(API_NAME_PATTERN);
	});

	it("preserves hyphens and underscores", () => {
		const result = sanitizeMcpToolName({ serverName: "my_server-v2", toolName: "get-data_v3" });
		expect(result).toBe("my_server-v2__get-data_v3");
		expect(result).toMatch(API_NAME_PATTERN);
	});

	it("truncates names longer than 128 characters", () => {
		const longServer = "a".repeat(100);
		const longTool = "b".repeat(100);
		const result = sanitizeMcpToolName({ serverName: longServer, toolName: longTool });
		expect(result).toHaveLength(128);
		expect(result).toMatch(API_NAME_PATTERN);
	});

	it("handles empty server name", () => {
		const result = sanitizeMcpToolName({ serverName: "", toolName: "my_tool" });
		expect(result).toBe("__my_tool");
		expect(result).toMatch(API_NAME_PATTERN);
	});

	it("handles the real-world github.com/cline/linear-mcp pattern from the original error", () => {
		const result = sanitizeMcpToolName({
			serverName: "github.com/cline/linear-mcp",
			toolName: "linear_auth",
		});
		expect(result).toMatch(API_NAME_PATTERN);
		expect(result).not.toContain(".");
		expect(result).not.toContain("/");
	});
});
