import 'reflect-metadata'
import { container } from 'tsyringe'
import { GetLLMUsageUseCase, Params as LParams, Output as LOutput} from './use-cases/get-llm-usage.use-case'
import { GetLLMUsageStatsUseCase, Params as SParams, Output as SOutput } from './use-cases/get-llm-usage-stats.use-case'
import { CreateLLMCallUseCase, Params as CParams, Output as COutput} from './use-cases/create-llmcall.use-case'

export async function getLLMUsage (props: LParams): Promise<LOutput> {
    const getLLMUsageUseCase = container.resolve(GetLLMUsageUseCase)
    return getLLMUsageUseCase.execute(props)
}

export async function getLLMUsageStats (props: SParams): Promise<SOutput> {
    const getLLMUsageStatsUseCase = container.resolve(GetLLMUsageStatsUseCase)
    return getLLMUsageStatsUseCase.execute(props)
}

export async function createLLMCall (props: CParams): Promise<COutput> {
    const createLLMCall = container.resolve(CreateLLMCallUseCase)
    return createLLMCall.execute(props)
}
