interface SamplingRule {
    provider: string
    model?: RegExp
    withThinking?: boolean
}

const NO_TEMPERATURE: SamplingRule[] = [
    { provider: 'amazon-bedrock', model: /claude/, withThinking: true },
]

export function omitsTemperature (provider: string, model: string, thinking: boolean): boolean {
    return NO_TEMPERATURE.some(rule => rule.provider === provider && (!rule.model || rule.model.test(model)) && (!rule.withThinking || thinking))
}
