import 'dotenv/config'
import Cryptr from 'cryptr'
import { logger } from '@common/logger'

export class SecretManager {
    private static instance: SecretManager
    private cache = new Map<string, string>()
    private cryptr: Cryptr

    static getInstance(): SecretManager {
        if (!SecretManager.instance) {
            SecretManager.instance = new SecretManager()
        }
        return SecretManager.instance
    }

    static encrypt(value: string): string {
        if (!value) throw new Error('[Secret manager] Value to encrypt cannot be empty')
        return `ENC:${SecretManager.getInstance().cryptr.encrypt(value)}`
    }

    private constructor() {
        const secretKey = process.env.SECRET_MANAGER_KEY
        if (!secretKey) {
            throw new Error('[Secret manager] SSUID environment variable is not set')
        }

        this.cryptr = new Cryptr(secretKey, {
            pbkdf2Iterations: 1_000,
            saltLength: 16
        })
    }

    get(key: string): string {
        const startTime = process.hrtime.bigint()

        if (this.cache.has(key)) {
            const decryptedValue = this.cache.get(key) as string
            this.logElapsed(key, startTime, true)
            return decryptedValue
        }

        const encryptedValue = this.getEnvVar(key)
        const decryptedValue = this.decryptEnvVar(encryptedValue)

        this.cache.set(key, decryptedValue)
        this.logElapsed(key, startTime, false)

        return decryptedValue
    }

    private getEnvVar(key: string): string {
        const value = process.env[key]
        if (!value) throw new Error(`[Secret manager] Environment variable ${key} is not set`)
        return value
    }

    private decryptEnvVar(encryptedValue: string): string {
        if (!encryptedValue) throw new Error('[Secret manager] Encrypted value cannot be empty')

        if (!this.isStringEncrypted(encryptedValue)) {
            logger.debug('[Secret Manager] Value is not encrypted')
            return encryptedValue
        }

        const valueWithoutPrefix = encryptedValue.replace(/^ENC:/, '')
        return this.cryptr.decrypt(valueWithoutPrefix)
    }

    private isStringEncrypted(value: string): boolean {
        if (!value) return false
        return value.startsWith('ENC:')
    }

    private logElapsed(key: string, startTime: bigint, cached: boolean): void {
        const endTime = process.hrtime.bigint()
        const elapsedTimeInMs = Number(endTime - startTime) / 1_000_000
        const suffix = cached ? ' (cached)' : ''
        logger.debug(`[Secret Manager] GET: ${key} | ${elapsedTimeInMs.toFixed(3)} ms${suffix}`)
    }
}

export const secretManager = SecretManager.getInstance()
