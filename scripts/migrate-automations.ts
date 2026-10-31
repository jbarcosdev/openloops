import { MongoClient } from 'mongodb'
import { getDatabaseName } from '@common/utils/database-name'
import { secretManager } from '@common/utils/secret-manager'
import { migrateAutomations } from '../src/db/migrations/automations'

async function main (): Promise<void> {
    const uri = secretManager.get('OPENLOOPS_DB_URI')
    if (!uri) throw new Error('OPENLOOPS_DB_URI is required')

    const client = new MongoClient(uri)

    try {
        await client.connect()

        const report = await migrateAutomations(client.db(getDatabaseName()), { dryRun: process.argv.includes('--dry-run') })

        console.log(JSON.stringify(report, null, 2))
    } finally {
        await client.close()
    }
}

main().catch(error => {
    console.error(error?.message ?? error)
    process.exit(1)
})
