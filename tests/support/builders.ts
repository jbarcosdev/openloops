import { ObjectId } from 'mongodb'
import { AgentTask } from '@services/tasks/entities/agent-task.entity'

export function newTask (props: { goal?: string; opening?: string } = {}): AgentTask {
    const task = new AgentTask({ goal: props.goal ?? 'goal' })
    task.setId(new ObjectId())
    task.opening = props.opening ?? '{}'
    return task
}

export const REAL_ID = '7133dbb1bc3d43d79ef5e720e577f8aa'
export const INVENTED_ID = '2e8f5f4fbc3e4f3285b3332508653630'
