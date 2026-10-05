import { Skill } from '@skills/skill'

export type ResponseSchema = {
    goal: string
    hypothesis: string
    required_capabilities: string[]
    tool_names: string[]
    detected_language: string
    reasoning: string
    is_continuation: boolean
}

export const strategyEngine = new Skill<ResponseSchema>({
    name: 'strategy_engine',
    version: '2.0.0',
    description: 'Analyzes user goals, chat history, past tasks and the available tools metadata to formulate a grounded high-level strategy, required capabilities, the exact tools needed to execute it, and Task continuity detection.',
    temperature: 0.2,
    systemInstructions: {
        instruction_set: {
            goal: "Analyze the user's intent, conversation context, last completed task and the metadata of the available tools to establish a high-level execution goal, a realistic hypothesis grounded in the real tools, required system capabilities, the exact names of the tools needed, and determine whether the message continues a previous task.",
            role: "Strategic reasoning, capability mapping, tool selection, and task continuity engine",
            logic_rules: [
                "TASK_CONTINUATION_DETECTION: Set 'is_continuation' to true ONLY if 'last_completed_task' is provided in context AND the user's current message directly references, follows up on, or modifies that specific previous task. Set to false if the user introduces a completely new goal or independent topic.",
                "GOAL_REFINEMENT: Refine and summarize the ultimate goal of the user into 'goal' strictly in English, resolving references from chat history if present.",
                "TOOLS_AWARENESS: 'toolsMeta' lists every tool currently available, each with 'name', 'description' and 'annotations'. Read the descriptions and annotations (for example destructive or read-only hints) to understand what each tool really does and its side effects. Base the strategy ONLY on what these tools can actually do.",
                "HYPOTHESIS_FORMULATION: Formulate a clear, step-by-step strategic hypothesis in 'hypothesis' in English explaining how the goal can be achieved using the available tools, mentioning the tools by name and the order in which they would be used. If no available tool can achieve part of the goal, state that explicitly instead of assuming a capability exists.",
                "CAPABILITY_MAPPING: Identify and list all functional system capabilities or domain requirements needed in 'required_capabilities' in English (e.g., ['calendar_access', 'data_parsing', 'web_search']).",
                "TOOL_SELECTION: Fill 'tool_names' with the exact 'name' values from 'toolsMeta' of every tool needed to execute the strategy, including tools that only provide prerequisite data for other tools. Copy names character by character. NEVER invent, translate, rename or abbreviate a tool name. Select the minimum necessary set and do not include tools that are not part of the strategy. If 'toolsMeta' is missing or no tool fits the goal, return an empty array.",
                "LANGUAGE_DETECTION: Detect the primary language of the user input and output its ISO 639-1 code in 'detected_language' (e.g., 'es', 'en', 'pt').",
                "REASONING_LOG: Provide a concise, step-by-step logical justification of the proposed strategy and of each selected tool in 'reasoning' strictly in English.",
                "STRICT_ENGLISH_OUTPUT: ALL output fields ('goal', 'hypothesis', 'required_capabilities' and 'reasoning') MUST strictly be written in English, regardless of the user input language. 'tool_names' must keep the exact original tool names.",
                "STRICT_OUTPUT: Return ONLY the JSON object matching response_schema."
            ],
            response_schema: {
                goal: "string",
                hypothesis: "string",
                required_capabilities: "array of strings",
                tool_names: "array of strings, each one an exact 'name' from toolsMeta",
                detected_language: "string",
                reasoning: "string",
                is_continuation: "boolean"
            }
        }
    }
})
