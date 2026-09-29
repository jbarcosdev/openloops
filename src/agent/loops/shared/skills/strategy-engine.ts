import { Skill } from '../../../skills/skill'

type ResponseSchema = {
    goal: string
    hypothesis: string
    required_capabilities: string[]
    tool_keywords: Array<{ keyword: string; weight: number }>
    detected_language: string
    reasoning: string
    is_continuation: boolean
}

export const strategyEngine = new Skill<ResponseSchema>({
    name: 'strategy_engine',
    version: '1.3.0',
    description: 'Analyzes user goals, chat history, and past tasks to formulate high-level strategies, required capabilities, weighted tool discovery keywords, execution hypotheses, and Task continuity detection.',
    temperature: 0.2,
    systemInstructions: {
        instruction_set: {
            goal: "Analyze the user's intent, conversation context, and last completed task to establish a high-level execution goal, a logical hypothesis, required system capabilities, weighted keywords to match available tools, and determine whether the message continues a previous task.",
            role: "Strategic reasoning, capability mapping, tool discovery, and task continuity engine",
            logic_rules: [
                "TASK_CONTINUATION_DETECTION: Set 'is_continuation' to true ONLY if 'last_completed_task' is provided in context AND the user's current message directly references, follows up on, or modifies that specific previous task. Set to false if the user introduces a completely new goal or independent topic.",
                "GOAL_REFINEMENT: Refine and summarize the ultimate goal of the user into 'goal' strictly in English, resolving references from chat history if present.",
                "HYPOTHESIS_FORMULATION: Formulate a clear, step-by-step strategic hypothesis in 'hypothesis' in English explaining how the goal can be achieved logically.",
                "CAPABILITY_MAPPING: Identify and list all functional system capabilities or domain requirements needed in 'required_capabilities' in English (e.g., ['calendar_access', 'data_parsing', 'web_search']).",
                "TOOL_KEYWORD_EXTRACTION: Extract 4 to 8 single-word terms (no multi-word patterns or underscores) in English targeting functional backend tools. Always prioritize domain nouns (e.g., 'expense', 'transaction', 'finance', 'budget', 'search', 'weather'). Include target third-party platforms or services if explicitly mentioned or strongly implied (e.g., 'slack', 'jira', 'github', 'google') with lower weight. DO NOT extract specific dynamic entities or transactional values (e.g., 'McDonalds', '10 USD'). Assign a float 'weight' from 0.1 to 1.0 (0.9-1.0 for core domain nouns and primary action verbs; 0.5-0.7 for secondary/broader domain concepts; 0.3-0.5 for third-party platforms/services; 0.1-0.3 for generic operations).",
                "LANGUAGE_DETECTION: Detect the primary language of the user input and output its ISO 639-1 code in 'detected_language' (e.g., 'es', 'en', 'pt').",
                "REASONING_LOG: Provide a concise, step-by-step logical justification of the proposed strategy in 'reasoning' strictly in English.",
                "STRICT_ENGLISH_OUTPUT: ALL output fields ('goal', 'hypothesis', 'required_capabilities', 'tool_keywords' keywords, and 'reasoning') MUST strictly be written in English, regardless of the user input language.",
                "STRICT_OUTPUT: Return ONLY the JSON object matching response_schema."
            ],
            response_schema: {
                goal: "string",
                hypothesis: "string",
                required_capabilities: "array of strings",
                tool_keywords: "array of objects with fields 'keyword' (string) and 'weight' (number between 0.1 and 1.0)",
                detected_language: "string",
                reasoning: "string",
                is_continuation: "boolean"
            }
        }
    }
})
