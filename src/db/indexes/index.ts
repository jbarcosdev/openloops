import { Db, IndexDescription } from 'mongodb'
import { llmCalls } from './llm-calls'
import { chats } from './chats'
import { agentTasks } from './agent-tasks'
import { agentActions } from './agent-actions'
import { agentTraces } from './agent-traces'
import { workspaceItems } from './workspace-items'
import { mcpServers } from './mcp-servers'
import { agenticJobs } from './agentic-jobs'
import { agenticJobRuns } from './agentic-job-runs'

export const indexes: Record<string, IndexDescription[]> = {
	llm_calls: llmCalls,
	chats,
	agent_tasks: agentTasks,
	agent_actions: agentActions,
	agent_traces: agentTraces,
	workspace_items: workspaceItems,
	mcp_servers: mcpServers,
	agentic_jobs: agenticJobs,
	agentic_job_runs: agenticJobRuns,
}

export async function ensureIndexes (db: Db): Promise<Record<string, string[]>> {
	const created: Record<string, string[]> = {}

	for (const [name, definitions] of Object.entries(indexes)) {
		created[name] = await db.collection(name).createIndexes(definitions)
	}

	return created
}
