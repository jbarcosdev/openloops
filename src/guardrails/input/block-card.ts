import { Guard } from '../guard'

const CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g

function passesLuhn (digits: string): boolean {
    let sum = 0
    let double = false

    for (let index = digits.length - 1; index >= 0; index--) {
        let digit = Number(digits[index])

        if (double) {
            digit *= 2
            if (digit > 9) digit -= 9
        }

        sum += digit
        double = !double
    }

    return sum % 10 === 0
}

function hasCard (message: string): boolean {
    return (message.match(CANDIDATE) ?? []).some(candidate => {
        const digits = candidate.replace(/\D/g, '')
        return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)
    })
}

/**
 * Input guard that blocks messages containing a payment card number.
 * It looks for 13 to 19 digits, with or without spaces or dashes, and only blocks the ones that
 * pass the Luhn check, so order numbers and other long numbers are left alone.
 *
 * ```ts
 * import { inputGuards } from 'openloops/guardrails'
 *
 * agent.addGuard(inputGuards.blockCard)
 * agent.addGuard(inputGuards.blockCard.withReply('Never send card numbers in the chat.'))
 * ```
 */
export const blockCard = new Guard({
    name: 'block_card',
    description: 'Blocks messages that contain a payment card number',
    type: 'input',
    reply: 'Please do not share card numbers in this conversation.',
    ref: '9UnJJFEhYYYKCKAg+rCFA3VDfjsbST7a',
    handler: ({ message }) => hasCard(message) ? { passed: false, reason: 'Card number' } : { passed: true },
})
