import { AsyncLocalStorage } from 'node:async_hooks'

export type Configs = Readonly<Record<string, string>>

const storage = new AsyncLocalStorage<Configs>()

export const runWithConfigs = <T>(configs: Configs, fn: () => T): T => storage.run(configs, fn)

export const getContextConfigs = (): Configs | undefined => storage.getStore()
