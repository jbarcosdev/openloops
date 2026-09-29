import { Skill } from '../../../skills/skill'
import { FORMATTING, LATEX_FORMATTING, CITATION_FORMATTING } from '../../../skills/shared/shared-rules'

export type CallAiResponseSchema = {
    result: string
    reasoning: string
}

export const callAiSkill = new Skill<CallAiResponseSchema>({
    name: 'call-ai',
    version: '1.0.0',
    description: 'Executes custom AI analysis, summarization, extraction, or transformation tasks using dynamic agent-provided instructions and input context.',
    temperature: 0.3,
    systemInstructions: {
        instruction_set: {
            goal: "Execute the given task according to the specified instruction prompt, analyzing or processing the provided input to produce a clear, high-quality result.",
            role: "Flexible AI reasoning, analysis, summarization, and task execution engine",
            logic_rules: [
                "INSTRUCTION_EXECUTION: Strictly follow the custom guidelines, criteria, and role instructions defined in 'systemPrompt'.",
                "TASK_PROCESSING: Process the provided 'input_data' or context thoroughly, applying reasoning, extraction, or summarization as requested.",
                "REASONING_LOG: Provide a concise, step-by-step logical justification of the proposed strategy in 'reasoning' strictly in English.",
                FORMATTING,
                LATEX_FORMATTING,
                CITATION_FORMATTING,
                "STRICT_OUTPUT: Return ONLY the JSON object matching response_schema."
            ],
            response_schema: {
                result: "string",
                reasoning: "string"
            }
        }
    }
})
