import {
    Db,
    DbOptions,
    MongoClient as BaseMongoCLient,
    MongoClientOptions,
} from 'mongodb'
import { secretManager } from '@common/utils/secret-manager'
import { logger } from '@common/logger'
import { reportError } from '@common/error'

export class MongoClient {
    private client: BaseMongoCLient
    private logger = logger

    private isConnected = false

    constructor (uri: string, options?: MongoClientOptions) {
        if (!uri) throw new Error('[Mongo Client]: uri parameter is required')
        this.client = new BaseMongoCLient(uri, {
            ...options,
            connectTimeoutMS: 5000,
            serverSelectionTimeoutMS: 5000
        })
        this.logger.info('[Mongo Client] Client initialized')
    }

    async connect (): Promise<void> {
        if (!this.client) throw new Error('[Mongo Client]: Client is not initialized')
        if (!this.isConnected) {
            await this.client.connect()
            this.isConnected = true
            this.logger.info('[Mongo Client]: Connected to MongoDB')
        }
    }

    async close (force?: boolean): Promise<void> {
        await this.client.close(force || false)
        this.isConnected = false
    }

    async db (dbName?: string, options?: DbOptions): Promise<Db> {
        try { 
            await this.connect()
        } catch (error: any) {
            this.logger.error('[Mongo Client]: Error connecting to MongoDB')
            await reportError(`Error connecting to MongoDB: ${error.message}`, { error })

            throw error
        }

        return this.client.db(dbName, options)
    }
}

const mongoDBClients = new Map<string, MongoClient>()

export function getMongoDBClient(envVarName: string = 'OPENLOOPS_DB_URI'): MongoClient {
    if (!mongoDBClients.has(envVarName)) {
        const connString = secretManager.get(envVarName)

        if (connString) {
            mongoDBClients.set(envVarName, new MongoClient(connString, {}))
        }
    }

    return mongoDBClients.get(envVarName) as MongoClient
}
