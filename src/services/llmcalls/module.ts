import 'reflect-metadata'
import { container } from 'tsyringe'
import { GetLLMUsageUseCase, Params as LParams, Output as LOutput} from './lambdas/get-llm-usage'
import { CreateLLMCallUseCase, Params as CParams, Output as COutput} from './lambdas/create-llmcall'

export async function getLLMUsage (props: LParams): Promise<LOutput> {
    const getLLMUsageUseCase = container.resolve(GetLLMUsageUseCase)
    return getLLMUsageUseCase.execute(props)
}

export async function CreateLLMCall (props: CParams): Promise<COutput> {
    const createLLMCall = container.resolve(CreateLLMCallUseCase)
    return createLLMCall.execute(props)
}
