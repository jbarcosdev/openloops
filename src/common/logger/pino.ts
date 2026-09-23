import 'dotenv/config'
import pino from 'pino'
import pretty from 'pino-pretty'

const stream = pretty({ colorize: true })

type LogLevel = 'info' | 'warn' | 'debug' | 'error' | 'fatal'

export class Logger {
	private IS_LOCAL = process.env.IS_LOCAL === 'true' || process.env.NODE_ENV === 'development'
	private logger = this.IS_LOCAL ? pino({ level: 'debug' }, stream) : pino({ level: 'info' })

	private log(level: LogLevel, obj?: any, msg?: string) {
		if (typeof obj === 'string') {
			msg = obj
			obj = undefined
		}

		this.logger[level](obj ?? {}, msg || '')
	}

	info(obj?: any, msg?: string) {
		this.log('info', obj, msg)
	}

	warn(obj?: any, msg?: string) {
		this.log('warn', obj, msg)
	}

	debug(obj?: any, msg?: string) {
		this.log('debug', obj, msg)
	}

	error(obj?: any, msg?: string) {
		this.log('error', obj, msg)
	}

	fatal(obj?: any, msg?: string) {
		this.log('fatal', obj, msg)
	}
}

export const logger = new Logger()
