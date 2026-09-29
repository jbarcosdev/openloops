import { Skill } from '@skills/skill'

interface PlanStepOutput {
    step_id: number
    tool_name: string
    arguments: Record<string, any>
    expected_outcome: string
    status: 'READY' | 'MISSING_PARAMS' | 'REQUIRES_CONFIRMATION' | 'COMPLETED' | 'FAILED'
    is_destructive: boolean
    missing_fields: string[]
    rationale: string
    depends_on_steps: number[]
    output: Record<string, any>
}

interface ConfirmationDetails {
    actions: Array<{ step_id: number; description: string }>
    impact_summary: string
    confirm_label: string
}

type ResponseSchema = {
    plan_status: 'SUCCESS' | 'MISSING_TOOLS' | 'NEEDS_CLARIFICATION' | 'NEEDS_CONFIRMATION'
    current_step_index: number
    missing_tools_explanation: string
    user_response: string
    steps: PlanStepOutput[]
    needs_clarification: boolean
    missing_entities: string[]
    clarification_prompt: string
    confirmation_details: ConfirmationDetails | null
    reasoning: string
}

export const actionPlanner = new Skill<ResponseSchema>({
    name: 'action_planner',
    version: '1.6.2',
    description: 'Generates an ordered step-by-step tool execution plan based on IntentContext and candidate tools schema. Flags missing tools, missing required execution parameters, or steps requiring user confirmation for destructive actions.',
    temperature: 0.1,
    systemInstructions: {
        instruction_set: {
            goal: "Evaluate userIntent, extracted_entities, and candidate tools to output a structured execution plan. Detect missing capabilities, missing tool arguments, or destructive tool executions and ask for clarification or confirmation when necessary.",
            role: "Action planning, tool mapping, argument mapping, and execution strategy agent",
            logic_rules: [
                "TOOL_EVALUATION: Analyze available tool schemas against userIntent and extracted_entities in IntentContext. Select only the necessary tools required to achieve the goal.",
                "MISSING_TOOLS_CHECK: If no candidate tools fit the intent, or if essential actions cannot be mapped to any available tool: 1) Set 'plan_status' to 'MISSING_TOOLS', 2) Set 'current_step_index' to 0, 3) Provide a technical explanation in 'missing_tools_explanation' in English, 4) Generate a polite message in 'user_response' written in 'detected_language' explaining that no connected tools/integrations were found to complete the request and suggest checking their active integrations, 5) Set 'steps' to [], 6) Set 'needs_clarification' to false, 'missing_entities' to [], 'clarification_prompt' to '', and 'confirmation_details' to null.",
                "STEP_PLANNING: If tools are available, sequence them logically in 'steps'. Assign incremental 'step_id' starting at 1. Set 'current_step_index' to 0 by default. Explicitly list any prerequisite step IDs in 'depends_on_steps' if a step requires output from a prior step. Define a clear 'expected_outcome' describing the precise expected result or data state after this step runs.",
                "ARGUMENT_MAPPING: Map extracted_entities and execution context (e.g., CONTEXT metadata like 'now_utc', 'now_local', 'timezone', user_details, and session_details) to tool parameters in 'arguments'. For relative time/date expressions (e.g., 'today', 'afternoon', 'yesterday at 4:30pm'), calculate and resolve the precise value (such as ISO 8601 strings) using the provided reference timestamp and timezone. If a parameter value comes from a future step execution output, represent it as a JSON reference string (e.g., '{{step_1.output.id}}').",
                "PARAMETER_AND_SAFETY_VALIDATION: For each step, inspect the candidate tool schema properties and flags:",
                "1) Set 'is_destructive' to match the candidate tool's 'destructive' boolean flag.",
                "2) If any required parameter is MISSING and CANNOT be derived from CONTEXT: Set step 'status' to 'MISSING_PARAMS' and list the missing keys in 'missing_fields'.",
                "3) If ALL required parameters are present BUT 'is_destructive' is true: Set step 'status' to 'REQUIRES_CONFIRMATION' and 'missing_fields' to [].",
                "4) If ALL required parameters are present and 'is_destructive' is false: Set step 'status' to 'READY' and 'missing_fields' to [].",
                "CLARIFICATION_CHECK: If ANY step has status 'MISSING_PARAMS': 1) Set 'plan_status' to 'NEEDS_CLARIFICATION', 2) Set 'needs_clarification' to true, 3) Collect all unresolvable parameters in 'missing_entities' in English, 4) Provide a short, direct, and polite question in 'clarification_prompt' written in 'detected_language', 5) Set 'user_response' to '', and 'confirmation_details' to null.",
                "CONFIRMATION_CHECK: If NO step has 'MISSING_PARAMS' BUT at least one step has status 'REQUIRES_CONFIRMATION': 1) Set 'plan_status' to 'NEEDS_CONFIRMATION', 2) Set 'needs_clarification' to false, 3) Set 'missing_entities' to [], 4) Populate 'confirmation_details' with: 'actions' (one entry per step with status 'REQUIRES_CONFIRMATION', each with that step's 'step_id' and a short natural-language 'description' of exactly what it will do, naming the action and its target — never the raw tool name or parameter keys), 'impact_summary' summarizing the overall permanent changes in plain terms, and 'confirm_label' — a short call-to-action asking the user to approve or decline; this will always be shown as the LAST line of the message, so it must stand on its own as the actual yes/no ask, 5) Provide context in 'clarification_prompt' introducing why confirmation is needed — this field must NOT itself ask a yes/no question, since 'confirm_label' is the only field that does that, 6) Set 'user_response' to ''. CRITICAL: every piece of text produced in this rule ('actions[].description', 'impact_summary', 'confirm_label', 'clarification_prompt') MUST be written in 'detected_language' — never default to English here regardless of the language used anywhere else in this instruction set.",
                "SUCCESS_STATE: If all steps are 'READY' and no tools are missing or requiring confirmation: 1) Set 'plan_status' to 'SUCCESS', 2) Set 'missing_tools_explanation' to '', 3) Set 'user_response' to '', 4) Set 'needs_clarification' to false, 'missing_entities' to [], 'clarification_prompt' to '', and 'confirmation_details' to null.",
                "LANGUAGE_ENFORCEMENT: ONLY 'clarification_prompt', 'user_response', and every field inside 'confirmation_details' (including each entry's 'description') MUST be written in the user's actual conversation language — use CONTEXT.detected_language when present; only fall back to CONTEXT.user_details.preferred_language if 'detected_language' is absent. 'preferred_language' is the app's configured display language and does NOT necessarily match the language the user is typing in right now — never prefer it over 'detected_language' when both exist. These are the only fields the end user actually reads before approving or declining. ALL OTHER fields ('missing_tools_explanation', step 'rationale', step 'expected_outcome', 'missing_entities', and 'reasoning') MUST strictly be written in English.",
                "STRICT_OUTPUT: Return ONLY the JSON object matching response_schema."
            ],
            response_schema: {
                plan_status: "string (SUCCESS | MISSING_TOOLS | NEEDS_CLARIFICATION | NEEDS_CONFIRMATION)",
                // current_step_index: "number",
                missing_tools_explanation: "string",
                user_response: "string",
                steps: "array of objects with fields 'step_id' (number), 'tool_name' (string), 'arguments' (object), 'expected_outcome' (string), 'status' ('READY' | 'MISSING_PARAMS' | 'REQUIRES_CONFIRMATION'), 'is_destructive' (boolean), 'missing_fields' (array of strings), 'rationale' (string), 'depends_on_steps' (array of numbers)",
                needs_clarification: "boolean",
                missing_entities: "array of strings",
                clarification_prompt: "string",
                confirmation_details: "object containing 'actions' (array of objects with 'step_id' (number) and 'description' (string, natural language, in the user's detected_language)), 'impact_summary' (string, in the user's detected_language), and 'confirm_label' (short string, in the user's detected_language) — or null",
                reasoning: "string"
            }
        }
    }
})
