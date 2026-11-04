import { GetLLMUsageByMessageUseCase, Params as MParams, Output as MOutput } from './use-cases/get-llm-usage-by-message.use-case'
import { GetLLMUsageByChatUseCase, Params as HParams, Output as HOutput } from './use-cases/get-llm-usage-by-chat.use-case'
import { GetLLMUsageStatsUseCase, Params as SParams, Output as SOutput } from './use-cases/get-llm-usage-stats.use-case'
import { CreateLLMCallUseCase, Params as CParams, Output as COutput} from './use-cases/create-llmcall.use-case'

export async function getLLMUsageByMessage (props: MParams): Promise<MOutput> {
    const getLLMUsageByMessageUseCase = new GetLLMUsageByMessageUseCase()
    return getLLMUsageByMessageUseCase.execute(props)
}

export async function getLLMUsageByChat (props: HParams): Promise<HOutput> {
    const getLLMUsageByChatUseCase = new GetLLMUsageByChatUseCase()
    return getLLMUsageByChatUseCase.execute(props)
}

export async function getLLMUsageStats (props: SParams): Promise<SOutput> {
    const getLLMUsageStatsUseCase = new GetLLMUsageStatsUseCase()
    return getLLMUsageStatsUseCase.execute(props)
}

export async function createLLMCall (props: CParams): Promise<COutput> {
    const createLLMCall = new CreateLLMCallUseCase()
    return createLLMCall.execute(props)
}
