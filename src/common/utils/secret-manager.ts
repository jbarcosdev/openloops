import 'dotenv/config'
import Cryptr from 'cryptr'
import { logger } from '@common/logger'
import { getContextConfigs } from './config-context'

const VERSIONED = /^ENC:v(\d+):/

export class SecretManager {
    private static instance: SecretManager
    private envCache = new Map<string, string>()
    private contextCache = new WeakMap<object, Map<string, string>>()
    private cryptrs = new Map<string, Cryptr>()

    static getInstance(): SecretManager {
        if (!SecretManager.instance) {
            SecretManager.instance = new SecretManager()
        }
        return SecretManager.instance
    }

    static encrypt(value: string, version?: number): string {
        if (!value) throw new Error('[Secret manager] Value to encrypt cannot be empty')
        const manager = SecretManager.getInstance()
        if (!version) return `ENC:${manager.cryptr().encrypt(value)}`
        return `ENC:v${version}:${manager.cryptr(version).encrypt(value)}`
    }

    private constructor() {
        this.cryptr()
    }

    private cryptr(version?: number): Cryptr {
        const envName = version ? `SECRET_MANAGER_KEY_V${version}` : 'SECRET_MANAGER_KEY'
        const cached = this.cryptrs.get(envName)
        if (cached) return cached

        const secretKey = process.env[envName]
        if (!secretKey) {
            throw new Error(`[Secret manager] ${envName} environment variable is not set`)
        }

        const cryptr = new Cryptr(secretKey, {
            pbkdf2Iterations: 1_000,
            saltLength: 16
        })
        this.cryptrs.set(envName, cryptr)
        return cryptr
    }

    get(key: string): string {
        const startTime = process.hrtime.bigint()
        const configs = getContextConfigs()
        const cache = configs ? this.cacheOf(configs) : this.envCache

        if (cache.has(key)) {
            this.logElapsed(key, startTime, true)
            return cache.get(key) as string
        }

        const raw = configs ? configs[key] : this.getEnvVar(key)
        const decryptedValue = this.decrypt(raw)

        cache.set(key, decryptedValue)
        this.logElapsed(key, startTime, false)

        return decryptedValue
    }

    private cacheOf(configs: object): Map<string, string> {
        let cache = this.contextCache.get(configs)
        if (!cache) {
            cache = new Map()
            this.contextCache.set(configs, cache)
        }
        return cache
    }

    private getEnvVar(key: string): string {
        const value = process.env[key]
        if (!value) {
            logger.warn({ key }, '[Secret manager] Environment variable is not set')
            return ''
        }
        return value
    }

    private decrypt(value: string | undefined): string {
        if (!value) return ''
        if (!value.startsWith('ENC:')) return value

        const versioned = VERSIONED.exec(value)
        if (versioned) return this.cryptr(Number(versioned[1])).decrypt(value.slice(versioned[0].length))

        return this.cryptr().decrypt(value.replace(/^ENC:/, ''))
    }

    private logElapsed(key: string, startTime: bigint, cached: boolean): void {
        const endTime = process.hrtime.bigint()
        const elapsedTimeInMs = Number(endTime - startTime) / 1_000_000
        const suffix = cached ? ' (cached)' : ''
        logger.debug(`[Secret Manager] GET: ${key} | ${elapsedTimeInMs.toFixed(3)} ms${suffix}`)
    }
}

export const secretManager = SecretManager.getInstance()
