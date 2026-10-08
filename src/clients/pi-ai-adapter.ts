import type { Api, AssistantMessage, Context, Message, Model, Tool as PiTool } from '@earendil-works/pi-ai'
import type { LLMMessage, LLMResponse, LLMStopReason, LLMToolDefinition } from './llm-types'

const ZERO_USAGE = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function isPiAssistant (value: unknown): value is AssistantMessage {
    return Boolean(value) && (value as any).role === 'assistant' && Array.isArray((value as any).content)
}

function toPiTool (tool: LLMToolDefinition): PiTool {
    return { name: tool.name, description: tool.description, parameters: tool.parameters as any }
}

export function toPiContext (input: { messages: LLMMessage[]; tools?: LLMToolDefinition[] }, model: Model<Api>): Context {
    const leading: string[] = []
    const messages: Message[] = []
    let seenConversation = false

    for (const message of input.messages) {
        const timestamp = Date.now()

        switch (message.role) {
            case 'system':
                if (!seenConversation) leading.push(message.content)
                else messages.push({ role: 'system', content: message.content, timestamp })
                break

            case 'user':
                seenConversation = true
                messages.push({ role: 'user', content: message.content, timestamp })
                break

            case 'assistant': {
                seenConversation = true

                if (isPiAssistant(message.native)) {
                    messages.push(message.native)
                    break
                }

                const content: AssistantMessage['content'] = []
                if (message.content) content.push({ type: 'text', text: message.content })
                for (const call of message.toolCalls ?? []) content.push({ type: 'toolCall', id: call.id, name: call.name, arguments: call.arguments })

                messages.push({
                    role: 'assistant',
                    content,
                    api: model.api,
                    provider: model.provider,
                    model: model.id,
                    usage: ZERO_USAGE,
                    stopReason: message.toolCalls?.length ? 'toolUse' : 'stop',
                    timestamp,
                })
                break
            }

            case 'tool':
                seenConversation = true
                messages.push({
                    role: 'toolResult',
                    toolCallId: message.toolCallId,
                    toolName: message.toolName,
                    content: [{ type: 'text', text: message.content }],
                    isError: Boolean(message.isError),
                    timestamp,
                })
                break
        }
    }

    return {
        ...(leading.length ? { systemPrompt: leading.join('\n\n') } : {}),
        messages,
        ...(input.tools?.length ? { tools: input.tools.map(toPiTool) } : {}),
    }
}

function mapStopReason (reason: string): LLMStopReason {
    switch (reason) {
        case 'toolUse': return 'tool_use'
        case 'length': return 'length'
        case 'error': return 'error'
        case 'aborted': return 'aborted'
        default: return 'stop'
    }
}

export function fromPiMessage (message: AssistantMessage): LLMResponse {
    const text = message.content
        .filter(block => block.type === 'text')
        .map(block => (block as { text: string }).text)
        .join('')

    const toolCalls = message.content
        .filter(block => block.type === 'toolCall')
        .map(block => {
            const call = block as { id: string; name: string; arguments: Record<string, any> }
            return { id: call.id, name: call.name, arguments: call.arguments ?? {} }
        })

    const usage = message.usage

    return {
        text,
        toolCalls,
        stopReason: mapStopReason(message.stopReason),
        usage: {
            input: usage?.input ?? 0,
            output: usage?.output ?? 0,
            cacheRead: usage?.cacheRead ?? 0,
            cacheWrite: usage?.cacheWrite ?? 0,
            totalTokens: usage?.totalTokens ?? 0,
            costInUsd: usage?.cost?.total ?? 0,
        },
        responseId: message.responseId,
        model: message.model,
        errorMessage: message.errorMessage,
        native: message,
    }
}
