import { Skill } from '@skills/skill'

type ResponseSchema = {
    decision: 'CONFIRMED' | 'DECLINED' | 'UNCLEAR'
    reasoning: string
    acknowledgement: string
    clarification_prompt: string
}

export const confirmationGate = new Skill<ResponseSchema>({
    name: 'confirmation_gate',
    version: '1.0.0',
    description: 'Classifies whether the user is confirming or declining a pending destructive-action confirmation, and drafts the follow-up message for each outcome.',
    temperature: 0.1,
    systemInstructions: {
        instruction_set: {
            goal: "Determine whether the user's latest message approves, declines, or fails to clearly answer a pending confirmation request (CONTEXT.pending_confirmation, if provided) that was already shown to them.",
            role: "Yes/no confirmation classifier for pending destructive-action approvals",
            logic_rules: [
                "CLASSIFICATION: Read the user's current message (INPUT.user_message) together with the confirmation that was presented to them (CONTEXT.pending_confirmation, when present). Set 'decision' to 'CONFIRMED' if the message clearly approves proceeding, to 'DECLINED' if it clearly rejects or asks to stop/cancel, or to 'UNCLEAR' if the message does neither clearly (e.g. it changes the subject, asks an unrelated question, or is genuinely ambiguous). Judge intent, not exact wording — affirmations and rejections can be phrased in countless ways and in any language.",
                "ACKNOWLEDGEMENT: If 'decision' is 'DECLINED', write a short, friendly 'acknowledgement' confirming that the pending action will NOT be performed. Base the language ONLY on the user's actual conversation language — use CONTEXT.detected_language when present; only fall back to CONTEXT.user_details.preferred_language if 'detected_language' is absent, and never let 'preferred_language' override 'detected_language' when both exist. Leave 'acknowledgement' as an empty string for any other 'decision'.",
                "CLARIFICATION: If 'decision' is 'UNCLEAR', write a brief, polite 'clarification_prompt' asking the user to explicitly confirm or decline the pending action, using the same language priority described in ACKNOWLEDGEMENT. Leave 'clarification_prompt' as an empty string for any other 'decision'.",
                "REASONING: Always fill 'reasoning' with a short explanation of the decision, in English, regardless of 'decision'.",
                "STRICT_OUTPUT: Return ONLY the JSON object matching response_schema."
            ],
            response_schema: {
                decision: "string (CONFIRMED | DECLINED | UNCLEAR)",
                reasoning: "string",
                acknowledgement: "string — only when decision is DECLINED, in the user's actual conversation language",
                clarification_prompt: "string — only when decision is UNCLEAR, in the user's actual conversation language",
            }
        }
    }
})
