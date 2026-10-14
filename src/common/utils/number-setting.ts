import { secretManager } from './secret-manager'

export const numberSetting = (key: string, fallback: number): number => {
    const value = Number(secretManager.get(key))
    return Number.isInteger(value) && value > 0 ? value : fallback
}
