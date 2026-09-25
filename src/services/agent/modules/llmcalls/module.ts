import 'reflect-metadata'
import { container } from 'tsyringe'
import { GetLLMUsageUseCase, Params as LParams, Output as LOutput} from './lambdas/get-llm-usage'

export async function getLLMUsage (props: LParams): Promise<LOutput> {
    const getLLMUsageUseCase = container.resolve(GetLLMUsageUseCase)
    return getLLMUsageUseCase.execute(props)
}
