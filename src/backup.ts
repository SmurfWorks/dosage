import { parseBasals, type Basal } from './basal'
import type { Settings } from './calculator'
import { parseStoredLog, type LogEntry } from './log'
import type { GlucoseUnit } from './units'

export const BACKUP_VERSION = 1

export type Routine = Settings & {
  glucoseUnit: GlucoseUnit
  showFibre: boolean
  basals: Basal[]
}

export type Backup = {
  app: 'dosage'
  version: typeof BACKUP_VERSION
  exportedAt: string
  routine: Routine
  log: LogEntry[]
}

export type BackupResult = { ok: true; backup: Backup } | { ok: false; message: string }

const UNREADABLE = 'That file is not a Dosage backup.'
const NEWER = 'That backup is from a newer version of Dosage.'

export function createBackup(routine: Routine, log: LogEntry[], exportedAt = new Date()): Backup {
  return {
    app: 'dosage',
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    routine,
    log,
  }
}

export function backupFilename(when = new Date()): string {
  const year = when.getFullYear()
  const month = String(when.getMonth() + 1).padStart(2, '0')
  const day = String(when.getDate()).padStart(2, '0')
  return `dosage-backup-${year}-${month}-${day}.json`
}

export function parseBackup(value: unknown): BackupResult {
  if (!value || typeof value !== 'object') return { ok: false, message: UNREADABLE }
  const file = value as { app?: unknown; version?: unknown; exportedAt?: unknown; routine?: unknown; log?: unknown }
  if (file.app !== 'dosage') return { ok: false, message: UNREADABLE }
  if (file.version !== BACKUP_VERSION) {
    return { ok: false, message: typeof file.version === 'number' && file.version > BACKUP_VERSION ? NEWER : UNREADABLE }
  }
  if (typeof file.exportedAt !== 'string' || !Number.isFinite(Date.parse(file.exportedAt))) {
    return { ok: false, message: UNREADABLE }
  }
  const routine = readRoutine(file.routine)
  if (!routine) return { ok: false, message: UNREADABLE }
  const log = parseStoredLog(file.log)
  if (!log) return { ok: false, message: UNREADABLE }
  const ids = new Set<string>()
  for (const entry of log) {
    if (ids.has(entry.id)) return { ok: false, message: UNREADABLE }
    ids.add(entry.id)
  }
  return {
    ok: true,
    backup: { app: 'dosage', version: BACKUP_VERSION, exportedAt: file.exportedAt, routine, log },
  }
}

function readRoutine(value: unknown): Routine | null {
  if (!value || typeof value !== 'object') return null
  const stored = value as Partial<Routine>
  const rangeLow = readMmol(stored.rangeLow)
  const rangeHigh = readMmol(stored.rangeHigh)
  const targetMmol = readMmol(stored.targetMmol)
  const mmolRisePer10g = readMmol(stored.mmolRisePer10g)
  const mmolFallPerUnit = readMmol(stored.mmolFallPerUnit)
  if (
    rangeLow === null ||
    rangeHigh === null ||
    targetMmol === null ||
    mmolRisePer10g === null ||
    mmolFallPerUnit === null
  ) {
    return null
  }
  const insulinStep = stored.insulinStep
  if (insulinStep !== 0.1 && insulinStep !== 0.5 && insulinStep !== 1) return null
  if (stored.glucoseUnit !== 'mmol' && stored.glucoseUnit !== 'mgdl') return null
  if (typeof stored.showFibre !== 'boolean') return null
  const basals = readBasals(stored.basals)
  if (!basals) return null
  return {
    rangeLow,
    rangeHigh,
    targetMmol,
    mmolRisePer10g,
    mmolFallPerUnit,
    insulinStep,
    glucoseUnit: stored.glucoseUnit,
    showFibre: stored.showFibre,
    basals,
  }
}

function readMmol(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 30) return null
  return value
}

function readBasals(value: unknown): Basal[] | null {
  if (!Array.isArray(value)) return null
  if (value.some((item) => !item || typeof item !== 'object')) return null
  const parsed = parseBasals(value)
  if (parsed.length !== value.length) return null
  return parsed
}
