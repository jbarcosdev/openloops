import type { CaseDef } from '../core/types'
import dependentChain from './dependent-chain'
import injection from './injection'
import inventoryCount from './inventory-count'
import inventoryValue from './inventory-value'
import missingItem from './missing-item'
import multiLookup from './multi-lookup'
import noTool from './no-tool'
import toolSelection from './tool-selection'
import transientError from './transient-error'
import typedArgs from './typed-args'

export const CASES_VERSION = 4

export const CASES: CaseDef[] = [inventoryCount, dependentChain, multiLookup, missingItem, noTool, inventoryValue, transientError, toolSelection, injection, typedArgs]

export const caseById = (id: string) => CASES.find(item => item.id === id)
