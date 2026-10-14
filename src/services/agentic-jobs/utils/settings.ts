import { numberSetting } from '@common/utils/number-setting'

const DEFAULT_LEASE_MS = 10 * 60 * 1000
const DEFAULT_POLL_INTERVAL_MS = 60 * 1000

export const leaseMs = (): number => numberSetting('AGENTIC_JOBS_LEASE_MS', DEFAULT_LEASE_MS)

export const pollIntervalMs = (): number => numberSetting('AGENTIC_JOBS_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS)
