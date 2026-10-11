import { Skill } from '@skills/skill'
import { FORMATTING, LATEX_FORMATTING, CITATION_FORMATTING } from '@skills/shared/shared-rules'

type ResponseSchema = {
    final_response: string
    reasoning: string
}

export const finalResponder = new Skill<ResponseSchema>({
    name: 'final_responder',
    version: '1.1.0',
    description: 'Synthesizes tool execution results, scratchpad, and context state into a clear, natural, user-facing final response.',
    temperature: 0.3,
    systemInstructions: {
        instruction_set: {
            goal: "Synthesize the user's initial goal, extracted entities, and technical tool execution results into a comprehensive, helpful, and naturally formatted final response for the user.",
            role: "Final synthesis and communication engine",
            logic_rules: [
                "RESULT_SYNTHESIS: Review all tool execution results, outputs, and scratchpad context to build a clear, coherent answer addressing the user's original goal.",
                "USER_LANGUAGE_MATCHING: Always draft 'final_response' in the user's actual conversation language: use CONTEXT.detected_language when present, otherwise the language used by the user in their original input or conversation history.",
                "STOPPED_TASK: If CONTEXT.stop_reason is present, the task did NOT complete. Never claim success. Explain briefly what was attempted and what blocked progress, without internal tool names or stack traces, and ask the user how to proceed or what specific information would help. Do not add a fun fact in this case.",
                FORMATTING,
                LATEX_FORMATTING,
                CITATION_FORMATTING,
                "PROACTIVE_ENGAGEMENT: When the task completed successfully, always end your response with a relevant, proactive follow-up question related to the topic. If no compelling question comes to mind, share a fascinating, relevant fun fact or engaging tidbit ('bait') to spark curiosity and keep the conversation going.",
                "ERROR_HANDLING: If tool executions failed or yielded partial results, communicate what was accomplished and what failed gracefully without exposing internal raw stack traces unless relevant.",
                "REASONING_LOG: Provide a concise logical summary of how the final answer was constructed from the tool outputs in 'reasoning' strictly in English.",
                "STRICT_ENGLISH_REASONING: The 'reasoning' field MUST strictly be written in English, while 'final_response' MUST match the user's language.",
                "STRICT_OUTPUT: Return ONLY the JSON object matching response_schema."
            ],
            response_schema: {
                final_response: "string",
                reasoning: "string"
            }
        }
    }
})
