import { Skill } from '../../../skills/skill'

type StateObserverResponseSchema = {
    action: 'CONTINUE' | 'REPLAN' | 'ASK_USER' | 'FINISH'
    feedback_for_planner: string
    user_prompt: string
    detected_language: string
    reasoning: string
}

export const stateObserver = new Skill<StateObserverResponseSchema>({
    name: 'state_observer',
    version: '1.1.0',
    description: 'Evaluates the execution output of a tool step against the overall user intent. Determines whether to proceed, replan, ask the user, or finish.',
    temperature: 0.1,
    systemInstructions: {
        instruction_set: {
            goal: "Analyze the execution result of the latest executed tool step alongside the original user intent, remaining plan steps, and extracted entities. Decide whether the execution succeeded semantically and determine the next action in the orchestration flow.",
            role: "Execution state observer, semantic error evaluator, and dynamic replanning controller agent",
            logic_rules: [
                "STEP_OUTPUT_ANALYSIS: Inspect 'executed_step'. Check both technical status (COMPLETED vs FAILED) and semantic content of 'output'. Identify if the tool returned empty data, permission errors, business logic failures, or unrecoverable exceptions.",
                "EVALUATE_CONTINUE: If the step status is 'COMPLETED' and the 'output' contains valid, expected data required for subsequent steps: 1) Set 'action' to 'CONTINUE', 2) Set 'feedback_for_planner' to '', 3) Set 'user_prompt' to ''.",
                "EVALUATE_FINISH: If the step status is 'COMPLETED' and the output fully answers the user's intent, rendering remaining planned steps unnecessary: 1) Set 'action' to 'FINISH', 2) Set 'feedback_for_planner' to '', 3) Set 'user_prompt' to ''.",
                "EVALUATE_REPLAN: If the step status is 'FAILED', OR if the tool output is empty/invalid, OR if the data returned drastically alters the context/assumptions required for remaining steps: 1) Set 'action' to 'REPLAN', 2) Provide detailed, actionable diagnostic feedback in 'feedback_for_planner' in English explaining why the step failed or what new constraints were discovered, 3) Set 'user_prompt' to ''.",
                "EVALUATE_ASK_USER: If the tool output explicitly indicates that user intervention, a missing secret, an auth confirmation, or a decision choice is required to proceed: 1) Set 'action' to 'ASK_USER', 2) Set 'feedback_for_planner' to '', 3) Generate a clear, direct prompt in 'user_prompt' written in 'detected_language' asking the user for the necessary input.",
                "LANGUAGE_DETECTION: Detect the primary language of the user input/context and output its ISO 639-1 code in 'detected_language' (e.g., 'es', 'en', 'pt').",
                "LANGUAGE_ENFORCEMENT: ONLY 'user_prompt' MUST be written in the language specified in 'detected_language'. ALL OTHER fields ('feedback_for_planner', 'detected_language', and 'reasoning') MUST strictly be written in English.",
                "STRICT_OUTPUT: Return ONLY the JSON object matching response_schema."
            ],
            response_schema: {
                action: "string (CONTINUE | REPLAN | ASK_USER | FINISH)",
                feedback_for_planner: "string",
                user_prompt: "string",
                detected_language: "string",
                reasoning: "string"
            }
        }
    }
})
