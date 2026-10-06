import { registerSW } from 'virtual:pwa-register'
import { calculate, DEFAULT_SETTINGS, type Settings } from './calculator'
import { dayGraphSvg } from './day-graph'
import { describeDose } from './format'
import {
  browserTimeZone,
  createLogEntry,
  dateInTimeZone,
  formatCarbs,
  formatDateKey,
  formatLocalDateKey,
  formatInsulin,
  formatLogTime,
  insulinStepFor,
  latestTargetMmol,
  loadLog,
  logDateKey,
  logMinutesOfDay,
  saveLog,
  shiftDateKey,
  todayDateKey,
  type LogEntry,
} from './log'
import { formatGlucose, glucoseUnitLabel, type GlucoseUnit } from './units'
import './style.css'

registerSW({ immediate: true })

const STORAGE_KEY = 'insulin-calculator.v1'
const MMOL_MAX = 40
const TARGET_MMOL_MAX = 30
const EFFECT_MMOL_MAX = 30

let glucoseUnit: GlucoseUnit = 'mmol'
let doseReady = false
let glucoseFromLog = false
let showFibre = true

const unitInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="glucose-unit"]')]
const glucoseUnitLabelEl = document.querySelector<HTMLElement>('#glucose-unit-label')!
const wholeInput = document.querySelector<HTMLInputElement>('#glucose-whole')!
const decimalInput = document.querySelector<HTMLInputElement>('#glucose-decimal')!
const wholeDown = document.querySelector<HTMLButtonElement>('#whole-down')!
const wholeUp = document.querySelector<HTMLButtonElement>('#whole-up')!
const decimalDown = document.querySelector<HTMLButtonElement>('#decimal-down')!
const decimalUp = document.querySelector<HTMLButtonElement>('#decimal-up')!
const carbsInput = document.querySelector<HTMLInputElement>('#carbs')!
const fibreWrap = document.querySelector<HTMLElement>('#fibre-wrap')!
const fibreInput = document.querySelector<HTMLInputElement>('#fibre')!
const showFibreInput = document.querySelector<HTMLInputElement>('#show-fibre')!
const glucoseSource = document.querySelector<HTMLElement>('#glucose-source')!
const saveAnywayButton = document.querySelector<HTMLButtonElement>('#save-log-anyway')!
const resultEl = document.querySelector<HTMLElement>('#result')!
const saveLogButton = document.querySelector<HTMLButtonElement>('#save-log')!
const saveNote = document.querySelector<HTMLElement>('#save-note')!
const entryNote = document.querySelector<HTMLTextAreaElement>('#entry-note')!
const entryNoteDetails = document.querySelector<HTMLDetailsElement>('#entry-note-details')!
const logDialog = document.querySelector<HTMLDialogElement>('#log')!
const logOpen = document.querySelector<HTMLButtonElement>('#log-open')!
const logClose = document.querySelector<HTMLButtonElement>('#log-close')!
const logPrev = document.querySelector<HTMLButtonElement>('#log-prev')!
const logNext = document.querySelector<HTMLButtonElement>('#log-next')!
const logDate = document.querySelector<HTMLInputElement>('#log-date')!
const logDateLabel = document.querySelector<HTMLElement>('#log-date-label')!
const logCalendar = document.querySelector<HTMLButtonElement>('#log-calendar')!
const logList = document.querySelector<HTMLElement>('#log-list')!
const logAddOpen = document.querySelector<HTMLButtonElement>('#log-add-open')!
const logAddClose = document.querySelector<HTMLButtonElement>('#log-add-close')!
const logAddForm = document.querySelector<HTMLFormElement>('#log-add')!
const logAddButton = document.querySelector<HTMLButtonElement>('#log-add-button')!
const addTime = document.querySelector<HTMLInputElement>('#add-time')!
const addGlucose = document.querySelector<HTMLInputElement>('#add-glucose')!
const addCarbs = document.querySelector<HTMLInputElement>('#add-carbs')!
const addInsulin = document.querySelector<HTMLInputElement>('#add-insulin')!
const addNote = document.querySelector<HTMLTextAreaElement>('#add-note')!
const addError = document.querySelector<HTMLElement>('#add-error')!
const form = document.querySelector<HTMLFormElement>('#dose-form')!
const installEl = document.querySelector<HTMLElement>('#install')!
const installButton = document.querySelector<HTMLButtonElement>('#install-button')!
const installDismiss = document.querySelector<HTMLButtonElement>('#install-dismiss')!
const installText = document.querySelector<HTMLElement>('#install-text')!
const resetButton = document.querySelector<HTMLButtonElement>('#reset-settings')!
const deleteDataButton = document.querySelector<HTMLButtonElement>('#delete-data')!
const deleteConfirm = document.querySelector<HTMLDialogElement>('#delete-confirm')!
const deleteCancel = document.querySelector<HTMLButtonElement>('#delete-cancel')!
const deleteConfirmButton = document.querySelector<HTMLButtonElement>('#delete-confirm-button')!
const aboutDialog = document.querySelector<HTMLDialogElement>('#about')!
const aboutOpen = document.querySelector<HTMLButtonElement>('#about-open')!
const aboutClose = document.querySelector<HTMLButtonElement>('#about-close')!

const settingInputs = {
  insulinStep: document.querySelector<HTMLSelectElement>('#insulin-step')!,
}

const targetWholeInput = document.querySelector<HTMLInputElement>('#target-whole')!
const targetDecimalInput = document.querySelector<HTMLInputElement>('#target-decimal')!
const targetWholeDown = document.querySelector<HTMLButtonElement>('#target-whole-down')!
const targetWholeUp = document.querySelector<HTMLButtonElement>('#target-whole-up')!
const targetDecimalDown = document.querySelector<HTMLButtonElement>('#target-decimal-down')!
const targetDecimalUp = document.querySelector<HTMLButtonElement>('#target-decimal-up')!

type SplitField = {
  whole: HTMLInputElement
  decimal: HTMLInputElement
  wholeDown: HTMLButtonElement
  wholeUp: HTMLButtonElement
  decimalDown: HTMLButtonElement
  decimalUp: HTMLButtonElement
  mmolMax: number
}

function splitField(prefix: string): SplitField {
  return {
    whole: document.querySelector<HTMLInputElement>(`#${prefix}-whole`)!,
    decimal: document.querySelector<HTMLInputElement>(`#${prefix}-decimal`)!,
    wholeDown: document.querySelector<HTMLButtonElement>(`#${prefix}-whole-down`)!,
    wholeUp: document.querySelector<HTMLButtonElement>(`#${prefix}-whole-up`)!,
    decimalDown: document.querySelector<HTMLButtonElement>(`#${prefix}-decimal-down`)!,
    decimalUp: document.querySelector<HTMLButtonElement>(`#${prefix}-decimal-up`)!,
    mmolMax: EFFECT_MMOL_MAX,
  }
}

const carbEffect = splitField('carb')
const insulinEffect = splitField('insulin')
const rangeLow = splitField('range-low')
const rangeHigh = splitField('range-high')

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[char] ?? char
  })
}

function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function glucoseCeiling(): number {
  return glucoseUnit === 'mgdl' ? MMOL_MAX * 18 : MMOL_MAX
}

function targetCeiling(): number {
  return glucoseUnit === 'mgdl' ? TARGET_MMOL_MAX * 18 : TARGET_MMOL_MAX
}

function readTargetParts(): { whole: number; decimal: number } {
  const ceiling = targetCeiling()
  let whole = readDigits(targetWholeInput, ceiling)
  let decimal = Number(targetDecimalInput.value.replace(/\D/g, '').slice(-1) || '0')
  if (decimal > 9) decimal = 9
  if (glucoseUnit === 'mmol' && whole >= ceiling) decimal = 0
  if (glucoseUnit === 'mgdl') decimal = 0
  return { whole, decimal }
}

function writeTarget(whole: number, decimal: number) {
  const ceiling = targetCeiling()
  targetWholeInput.value = String(whole)
  targetDecimalInput.value = String(decimal)
  const atFloor = whole === 0 && decimal === 0
  const atCeiling = whole >= ceiling
  targetWholeDown.disabled = atFloor
  targetDecimalDown.disabled = atFloor || glucoseUnit === 'mgdl'
  targetWholeUp.disabled = atCeiling
  targetDecimalUp.disabled = atCeiling || glucoseUnit === 'mgdl'
}

function readTargetMmol(): number {
  const { whole, decimal } = readTargetParts()
  if (glucoseUnit === 'mgdl') return whole / 18
  return whole + decimal / 10
}

function writeTargetFromMmol(mmol: number) {
  if (glucoseUnit === 'mgdl') {
    writeTarget(Math.min(targetCeiling(), Math.max(0, Math.round(mmol * 18))), 0)
    return
  }
  const tenths = Math.round(mmol * 10)
  let whole = Math.floor(tenths / 10)
  let decimal = tenths % 10
  if (whole >= TARGET_MMOL_MAX) {
    whole = TARGET_MMOL_MAX
    decimal = 0
  }
  writeTarget(whole, decimal)
}

function stepTargetWhole(delta: number) {
  const current = readTargetParts()
  const ceiling = targetCeiling()
  let whole = Math.min(ceiling, Math.max(0, current.whole + delta))
  let decimal = current.decimal
  if (glucoseUnit === 'mmol' && whole >= ceiling) decimal = 0
  writeTarget(whole, decimal)
  saveSettings()
  render()
}

function stepTargetDecimal(delta: number) {
  let { whole, decimal } = readTargetParts()
  decimal += delta
  if (decimal > 9) {
    if (whole >= TARGET_MMOL_MAX) decimal = 0
    else {
      whole += 1
      decimal = 0
    }
  } else if (decimal < 0) {
    if (whole <= 0) {
      whole = 0
      decimal = 0
    } else {
      whole -= 1
      decimal = 9
    }
  }
  if (whole >= TARGET_MMOL_MAX) {
    whole = TARGET_MMOL_MAX
    decimal = 0
  }
  writeTarget(whole, decimal)
  saveSettings()
  render()
}

function readSettings(): Settings {
  const step = Number(settingInputs.insulinStep.value)
  return {
    rangeLow: readSplitMmol(rangeLow),
    rangeHigh: readSplitMmol(rangeHigh),
    targetMmol: readTargetMmol(),
    mmolRisePer10g: readSplitMmol(carbEffect),
    mmolFallPerUnit: readSplitMmol(insulinEffect),
    insulinStep: step === 0.1 || step === 0.5 || step === 1 ? step : Number.NaN,
  }
}

function applySettings(settings: Settings) {
  writeSplitFromMmol(rangeLow, settings.rangeLow)
  writeSplitFromMmol(rangeHigh, settings.rangeHigh)
  writeTargetFromMmol(settings.targetMmol)
  writeSplitFromMmol(carbEffect, settings.mmolRisePer10g)
  writeSplitFromMmol(insulinEffect, settings.mmolFallPerUnit)
  settingInputs.insulinStep.value = String(settings.insulinStep)
}

function paintUnits() {
  const mgdl = glucoseUnit === 'mgdl'
  for (const part of document.querySelectorAll<HTMLElement>('.split .tenth, .split .point')) {
    part.hidden = mgdl
  }
  wholeInput.setAttribute('aria-label', mgdl ? 'Glucose' : 'Whole number')
  targetWholeInput.setAttribute('aria-label', mgdl ? 'Target' : 'Target whole number')
  rangeLow.whole.setAttribute('aria-label', mgdl ? 'Low end of range' : 'Low end whole number')
  rangeHigh.whole.setAttribute('aria-label', mgdl ? 'High end of range' : 'High end whole number')
  carbEffect.whole.setAttribute('aria-label', mgdl ? 'Carbohydrate effect' : 'Carbohydrate effect whole number')
  insulinEffect.whole.setAttribute('aria-label', mgdl ? 'Insulin effect' : 'Insulin effect whole number')
  addGlucose.setAttribute('aria-label', `Glucose, ${glucoseUnitLabel(glucoseUnit)}`)
  glucoseUnitLabelEl.textContent = glucoseUnitLabel(glucoseUnit)
  for (const input of unitInputs) input.checked = input.value === glucoseUnit
}

function paintFibre() {
  showFibreInput.checked = showFibre
  fibreWrap.hidden = !showFibre
}

function settingsAreValid(settings: Settings): boolean {
  return Object.values(settings).every((value) => Number.isFinite(value))
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      glucoseUnit = 'mmol'
      showFibre = true
      paintUnits()
      paintFibre()
      applySettings({ ...DEFAULT_SETTINGS })
      saveSettings()
      return
    }
    const parsed = JSON.parse(saved) as Partial<Settings> & { glucoseUnit?: string; showFibre?: boolean }
    glucoseUnit = parsed.glucoseUnit === 'mgdl' ? 'mgdl' : 'mmol'
    showFibre = parsed.showFibre !== false
    const merged = { ...DEFAULT_SETTINGS, ...parsed }
    if (merged.insulinStep !== 0.1 && merged.insulinStep !== 0.5 && merged.insulinStep !== 1) {
      merged.insulinStep = DEFAULT_SETTINGS.insulinStep
    }
    paintUnits()
    paintFibre()
    applySettings(merged)
  } catch {
    glucoseUnit = 'mmol'
    showFibre = true
    paintUnits()
    paintFibre()
    applySettings({ ...DEFAULT_SETTINGS })
    saveSettings()
  }
}

function saveSettings() {
  const settings = readSettings()
  if (!settingsAreValid(settings)) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, glucoseUnit, showFibre }))
}

function readDigits(input: HTMLInputElement, max: number): number {
  const digits = input.value.replace(/\D/g, '')
  if (!digits) return 0
  return Math.min(max, Number(digits))
}

function splitCeiling(field: SplitField): number {
  return glucoseUnit === 'mgdl' ? field.mmolMax * 18 : field.mmolMax
}

function readSplitParts(field: SplitField): { whole: number; decimal: number } {
  const ceiling = splitCeiling(field)
  let whole = readDigits(field.whole, ceiling)
  let decimal = Number(field.decimal.value.replace(/\D/g, '').slice(-1) || '0')
  if (decimal > 9) decimal = 9
  if (glucoseUnit === 'mmol' && whole >= ceiling) decimal = 0
  if (glucoseUnit === 'mgdl') decimal = 0
  return { whole, decimal }
}

function writeSplit(field: SplitField, whole: number, decimal: number) {
  const ceiling = splitCeiling(field)
  field.whole.value = String(whole)
  field.decimal.value = String(decimal)
  const atFloor = whole === 0 && decimal === 0
  const atCeiling = whole >= ceiling
  field.wholeDown.disabled = atFloor
  field.decimalDown.disabled = atFloor || glucoseUnit === 'mgdl'
  field.wholeUp.disabled = atCeiling
  field.decimalUp.disabled = atCeiling || glucoseUnit === 'mgdl'
}

function readSplitMmol(field: SplitField): number {
  const { whole, decimal } = readSplitParts(field)
  if (glucoseUnit === 'mgdl') return whole / 18
  return whole + decimal / 10
}

function writeSplitFromMmol(field: SplitField, mmol: number) {
  if (glucoseUnit === 'mgdl') {
    writeSplit(field, Math.min(splitCeiling(field), Math.max(0, Math.round(mmol * 18))), 0)
    return
  }
  const tenths = Math.round(mmol * 10)
  let whole = Math.floor(tenths / 10)
  let decimal = tenths % 10
  if (whole >= field.mmolMax) {
    whole = field.mmolMax
    decimal = 0
  }
  writeSplit(field, whole, decimal)
}

function stepSplitWhole(field: SplitField, delta: number) {
  const current = readSplitParts(field)
  const ceiling = splitCeiling(field)
  let whole = Math.min(ceiling, Math.max(0, current.whole + delta))
  let decimal = current.decimal
  if (glucoseUnit === 'mmol' && whole >= ceiling) decimal = 0
  writeSplit(field, whole, decimal)
  saveSettings()
  render()
}

function stepSplitDecimal(field: SplitField, delta: number) {
  let { whole, decimal } = readSplitParts(field)
  decimal += delta
  if (decimal > 9) {
    if (whole >= field.mmolMax) decimal = 0
    else {
      whole += 1
      decimal = 0
    }
  } else if (decimal < 0) {
    if (whole <= 0) {
      whole = 0
      decimal = 0
    } else {
      whole -= 1
      decimal = 9
    }
  }
  if (whole >= field.mmolMax) {
    whole = field.mmolMax
    decimal = 0
  }
  writeSplit(field, whole, decimal)
  saveSettings()
  render()
}

function bindSplit(field: SplitField) {
  field.wholeDown.addEventListener('click', () => stepSplitWhole(field, -1))
  field.wholeUp.addEventListener('click', () => stepSplitWhole(field, 1))
  field.decimalDown.addEventListener('click', () => stepSplitDecimal(field, -1))
  field.decimalUp.addEventListener('click', () => stepSplitDecimal(field, 1))
  field.whole.addEventListener('keydown', (event) => {
    if (glucoseUnit !== 'mmol') return
    if (event.key !== '.' && event.code !== 'NumpadDecimal') return
    event.preventDefault()
    field.decimal.focus()
    field.decimal.select()
  })
  field.whole.addEventListener('input', () => {
    const ceiling = splitCeiling(field)
    const whole = readDigits(field.whole, ceiling)
    const next = String(whole)
    if (field.whole.value !== next) field.whole.value = next
    const decimal = glucoseUnit === 'mmol' && whole < ceiling ? readSplitParts(field).decimal : 0
    writeSplit(field, whole, decimal)
    saveSettings()
    render()
  })
  field.decimal.addEventListener('input', () => {
    const decimal = field.decimal.value.replace(/\D/g, '').slice(-1) || '0'
    const parts = readSplitParts(field)
    writeSplit(field, parts.whole, parts.whole >= field.mmolMax ? 0 : Number(decimal))
    saveSettings()
    render()
  })
}

bindSplit(carbEffect)
bindSplit(insulinEffect)
bindSplit(rangeLow)
bindSplit(rangeHigh)

function readGlucoseParts(): { whole: number; decimal: number } {
  const ceiling = glucoseCeiling()
  let whole = readDigits(wholeInput, ceiling)
  let decimal = Number((decimalInput.value.replace(/\D/g, '').slice(-1) || '0'))
  if (decimal > 9) decimal = 9
  if (glucoseUnit === 'mmol' && whole >= ceiling) decimal = 0
  if (glucoseUnit === 'mgdl') decimal = 0
  return { whole, decimal }
}

function writeGlucose(whole: number, decimal: number) {
  const ceiling = glucoseCeiling()
  wholeInput.value = String(whole)
  decimalInput.value = String(decimal)
  const atFloor = whole === 0 && decimal === 0
  const atCeiling = whole >= ceiling
  wholeDown.disabled = atFloor
  decimalDown.disabled = atFloor || glucoseUnit === 'mgdl'
  wholeUp.disabled = atCeiling
  decimalUp.disabled = atCeiling || glucoseUnit === 'mgdl'
}

function readGlucoseMmol(): number {
  const { whole, decimal } = readGlucoseParts()
  if (glucoseUnit === 'mgdl') return whole / 18
  return whole + decimal / 10
}

function writeGlucoseFromMmol(mmol: number) {
  if (glucoseUnit === 'mgdl') {
    writeGlucose(Math.min(glucoseCeiling(), Math.max(0, Math.round(mmol * 18))), 0)
    return
  }
  const tenths = Math.round(mmol * 10)
  let whole = Math.floor(tenths / 10)
  let decimal = tenths % 10
  if (whole >= MMOL_MAX) {
    whole = MMOL_MAX
    decimal = 0
  }
  writeGlucose(whole, decimal)
}

function stepWhole(delta: number) {
  doseReady = true
  glucoseFromLog = false
  const current = readGlucoseParts()
  const ceiling = glucoseCeiling()
  let whole = Math.min(ceiling, Math.max(0, current.whole + delta))
  let decimal = current.decimal
  if (glucoseUnit === 'mmol' && whole >= ceiling) decimal = 0
  writeGlucose(whole, decimal)
  render()
}

function stepDecimal(delta: number) {
  doseReady = true
  glucoseFromLog = false
  let { whole, decimal } = readGlucoseParts()
  decimal += delta
  if (decimal > 9) {
    if (whole >= MMOL_MAX) decimal = 0
    else {
      whole += 1
      decimal = 0
    }
  } else if (decimal < 0) {
    if (whole <= 0) {
      whole = 0
      decimal = 0
    } else {
      whole -= 1
      decimal = 9
    }
  }
  if (whole >= MMOL_MAX) {
    whole = MMOL_MAX
    decimal = 0
  }
  writeGlucose(whole, decimal)
  render()
}

function readCarbs(): number {
  const parsed = parseDecimal(carbsInput.value)
  if (parsed === null || parsed < 0) return 0
  return parsed
}

function readFibre(): number {
  if (!showFibre) return 0
  const parsed = parseDecimal(fibreInput.value)
  if (parsed === null || parsed < 0) return 0
  return parsed
}

let pendingLog: {
  glucoseMmol: number
  insulinUnits: number
  insulinStep: number
  targetMmol: number
  carbsGrams: number
} | null = null

let selectedLogKey = ''

function paintLog(entries: LogEntry[]) {
  const today = todayDateKey()
  if (!selectedLogKey || selectedLogKey > today) selectedLogKey = today
  logDate.value = selectedLogKey
  logDate.max = today
  logNext.disabled = selectedLogKey >= today
  logDateLabel.textContent = formatDateKey(selectedLogKey)
  logAddButton.textContent = `Save for ${formatLocalDateKey(selectedLogKey)}`

  const dayEntries = entries
    .filter((entry) => logDateKey(entry.at, entry.timeZone) === selectedLogKey)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
  const unitLabel = glucoseUnitLabel(glucoseUnit)
  const items = dayEntries
    .map((entry) => {
      const glucose = `${formatGlucose(entry.glucoseMmol, glucoseUnit)} ${unitLabel}`
      const carbs = entry.carbsGrams === null ? '—' : formatCarbs(entry.carbsGrams)
      const insulin = formatInsulin(entry.insulinUnits, entry.insulinStep)
      const time = formatLogTime(entry.at, entry.timeZone)
      const note = entry.note ? `<p class="log-entry-note">${escapeHtml(entry.note)}</p>` : ''
      return `<li class="log-entry"><time datetime="${escapeHtml(entry.at)}">${escapeHtml(time)}</time><span>${escapeHtml(glucose)}</span><span class="carbs">${escapeHtml(carbs)}</span><span class="dose">${escapeHtml(insulin)}</span><button type="button" class="log-remove" data-remove="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(time)}">×</button>${note}</li>`
    })
    .join('')
  const graph = dayEntries.length === 0 ? '' : dayGraphSvg(dayEntries, glucoseUnit)
  const empty = dayEntries.length === 0 ? '<p class="log-empty">Nothing saved this day.</p>' : ''
  logList.innerHTML = `<section class="card log-day-card">${graph}${empty}<ol class="log-entries">${items}</ol></section>`
}

function closeOnBackdrop(dialog: HTMLDialogElement) {
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect()
    const inside =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    if (!inside) dialog.close()
  })
}

function render() {
  const settings = readSettings()
  const glucose = readGlucoseMmol()
  const carbs = readCarbs()
  const fibre = readFibre()
  const unitLabel = glucoseUnitLabel(glucoseUnit)
  pendingLog = null
  saveLogButton.disabled = true
  saveLogButton.hidden = true
  saveNote.textContent = ''
  saveNote.classList.remove('is-error')
  const notePending = entryNote.value.trim().length > 0
  glucoseSource.hidden = !glucoseFromLog || notePending

  if (!doseReady) {
    resultEl.hidden = true
    resultEl.className = 'result'
    resultEl.replaceChildren()
    if (notePending) showSaveForCurrentReading(settings, glucose, carbs)
    return
  }
  resultEl.hidden = false

  if (!(glucose > 0)) {
    resultEl.className = 'result insulin'
    resultEl.innerHTML = `
      <p class="kicker">Insulin</p>
      <p class="figure">0<span>units</span></p>
      <p class="detail">Set a glucose above 0 ${escapeHtml(unitLabel)}.</p>
    `
    return
  }

  const result = calculate({
    glucoseMmol: glucose,
    carbsGrams: carbs,
    fibreGrams: fibre,
    settings,
    glucoseUnit,
  })
  if (!result.ok) {
    resultEl.className = 'result error'
    resultEl.innerHTML = `<p class="detail">${escapeHtml(result.message)}</p>`
    return
  }

  showSaveForCurrentReading(settings, glucose, carbs, result.value.insulinUnits)

  const copy = describeDose(result.value, {
    glucoseMmol: glucose,
    carbsGrams: carbs,
    settings,
    glucoseUnit,
  })
  const working = copy.working.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
  resultEl.className = `result ${result.value.action}`
  resultEl.innerHTML = `
    <p class="kicker">${escapeHtml(copy.kicker)}</p>
    <p class="figure">${escapeHtml(copy.figure)}<span>${escapeHtml(copy.unit)}</span></p>
    ${copy.carbCallout ? `<p class="carb-callout">${escapeHtml(copy.carbCallout)}</p>` : ''}
    <p class="after"><span>After this</span>${escapeHtml(copy.after)}</p>
    <details class="working">
      <summary>Show the working</summary>
      <ul>${working}</ul>
    </details>
  `
}

form.addEventListener('submit', (event) => event.preventDefault())

wholeDown.addEventListener('click', () => stepWhole(-1))
wholeUp.addEventListener('click', () => stepWhole(1))
decimalDown.addEventListener('click', () => stepDecimal(-1))
decimalUp.addEventListener('click', () => stepDecimal(1))

wholeInput.addEventListener('keydown', (event) => {
  if (glucoseUnit !== 'mmol') return
  if (event.key !== '.' && event.code !== 'NumpadDecimal') return
  event.preventDefault()
  decimalInput.focus()
  decimalInput.select()
})

wholeInput.addEventListener('input', () => {
  doseReady = true
  glucoseFromLog = false
  const ceiling = glucoseCeiling()
  const whole = readDigits(wholeInput, ceiling)
  const next = String(whole)
  if (wholeInput.value !== next) wholeInput.value = next
  const decimal = glucoseUnit === 'mmol' && whole < ceiling ? readGlucoseParts().decimal : 0
  writeGlucose(whole, decimal)
  render()
})

decimalInput.addEventListener('input', () => {
  doseReady = true
  glucoseFromLog = false
  const decimal = decimalInput.value.replace(/\D/g, '').slice(-1) || '0'
  const parts = readGlucoseParts()
  writeGlucose(parts.whole, parts.whole >= MMOL_MAX ? 0 : Number(decimal))
  render()
})

targetWholeDown.addEventListener('click', () => stepTargetWhole(-1))
targetWholeUp.addEventListener('click', () => stepTargetWhole(1))
targetDecimalDown.addEventListener('click', () => stepTargetDecimal(-1))
targetDecimalUp.addEventListener('click', () => stepTargetDecimal(1))

targetWholeInput.addEventListener('keydown', (event) => {
  if (glucoseUnit !== 'mmol') return
  if (event.key !== '.' && event.code !== 'NumpadDecimal') return
  event.preventDefault()
  targetDecimalInput.focus()
  targetDecimalInput.select()
})

targetWholeInput.addEventListener('input', () => {
  const ceiling = targetCeiling()
  const whole = readDigits(targetWholeInput, ceiling)
  const next = String(whole)
  if (targetWholeInput.value !== next) targetWholeInput.value = next
  const decimal = glucoseUnit === 'mmol' && whole < ceiling ? readTargetParts().decimal : 0
  writeTarget(whole, decimal)
  saveSettings()
  render()
})

targetDecimalInput.addEventListener('input', () => {
  const decimal = targetDecimalInput.value.replace(/\D/g, '').slice(-1) || '0'
  const parts = readTargetParts()
  writeTarget(parts.whole, parts.whole >= TARGET_MMOL_MAX ? 0 : Number(decimal))
  saveSettings()
  render()
})

for (const input of unitInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) return
    const next: GlucoseUnit = input.value === 'mgdl' ? 'mgdl' : 'mmol'
    if (next === glucoseUnit) return
    const glucose = readGlucoseMmol()
    const settings = readSettings()
    glucoseUnit = next
    paintUnits()
    applySettings(settings)
    writeGlucoseFromMmol(glucose)
    saveSettings()
    render()
  })
}

carbsInput.addEventListener('input', () => {
  doseReady = true
  glucoseFromLog = false
  render()
})
fibreInput.addEventListener('input', () => {
  doseReady = true
  glucoseFromLog = false
  render()
})
showFibreInput.addEventListener('change', () => {
  showFibre = showFibreInput.checked
  paintFibre()
  saveSettings()
  render()
})

for (const input of Object.values(settingInputs)) {
  input.addEventListener('input', () => {
    saveSettings()
    render()
  })
  input.addEventListener('change', () => {
    saveSettings()
    render()
  })
}

resetButton.addEventListener('click', () => {
  applySettings({ ...DEFAULT_SETTINGS })
  saveSettings()
  render()
})

deleteDataButton.addEventListener('click', () => deleteConfirm.showModal())
deleteCancel.addEventListener('click', () => deleteConfirm.close())
closeOnBackdrop(deleteConfirm)
deleteConfirmButton.addEventListener('click', () => {
  deleteConfirm.close()
  glucoseUnit = 'mmol'
  showFibre = true
  paintUnits()
  paintFibre()
  applySettings({ ...DEFAULT_SETTINGS })
  saveSettings()
  saveLog([])
  carbsInput.value = '0'
  fibreInput.value = '0'
  entryNote.value = ''
  entryNoteDetails.open = false
  addGlucose.value = ''
  addCarbs.value = ''
  addInsulin.value = ''
  addNote.value = ''
  addError.textContent = ''
  logAddForm.hidden = true
  logAddOpen.hidden = false
  doseReady = false
  glucoseFromLog = false
  writeGlucoseFromMmol(6)
  render()
  if (logDialog.open) paintLog([])
})

entryNoteDetails.addEventListener('toggle', () => {
  if (!entryNoteDetails.open) return
  requestAnimationFrame(() => entryNote.focus())
})

entryNote.addEventListener('input', () => {
  render()
})

function showSaveForCurrentReading(
  settings: Settings,
  glucose: number,
  carbs: number,
  insulinUnits?: number,
) {
  if (!(glucose > 0)) return
  let units = insulinUnits
  if (units === undefined) {
    const result = calculate({
      glucoseMmol: glucose,
      carbsGrams: carbs,
      fibreGrams: readFibre(),
      settings,
      glucoseUnit,
    })
    if (!result.ok) return
    units = result.value.insulinUnits
  }
  pendingLog = {
    glucoseMmol: glucose,
    insulinUnits: units,
    insulinStep: settings.insulinStep,
    targetMmol: settings.targetMmol,
    carbsGrams: carbs,
  }
  saveLogButton.disabled = false
  saveLogButton.hidden = false
}

function storeLogEntry(payload: {
  glucoseMmol: number
  insulinUnits: number
  insulinStep: number
  targetMmol: number
  carbsGrams: number
}) {
  const entry = createLogEntry({ ...payload, note: entryNote.value })
  const entries = loadLog()
  entries.push(entry)
  saveLog(entries)
  carbsInput.value = '0'
  fibreInput.value = '0'
  entryNote.value = ''
  entryNoteDetails.open = false
  doseReady = false
  glucoseFromLog = true
  writeGlucoseFromMmol(entry.targetMmol)
  render()
  saveNote.textContent = `Saved at ${formatLogTime(entry.at, entry.timeZone)}.`
  if (logDialog.open) {
    selectedLogKey = logDateKey(entry.at, entry.timeZone)
    paintLog(loadLog())
  }
}

saveLogButton.addEventListener('click', () => {
  if (!pendingLog) return
  storeLogEntry(pendingLog)
})

saveAnywayButton.addEventListener('click', () => {
  const settings = readSettings()
  const glucose = readGlucoseMmol()
  const carbs = readCarbs()
  const fibre = readFibre()
  if (!(glucose > 0)) {
    saveNote.textContent = `Set a glucose above 0 ${glucoseUnitLabel(glucoseUnit)}.`
    saveNote.classList.add('is-error')
    return
  }
  const result = calculate({
    glucoseMmol: glucose,
    carbsGrams: carbs,
    fibreGrams: fibre,
    settings,
    glucoseUnit,
  })
  if (!result.ok) {
    saveNote.textContent = result.message
    saveNote.classList.add('is-error')
    return
  }
  storeLogEntry({
    glucoseMmol: glucose,
    insulinUnits: result.value.insulinUnits,
    insulinStep: settings.insulinStep,
    targetMmol: settings.targetMmol,
    carbsGrams: carbs,
  })
})

logAddForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const when = readWhen(selectedLogKey || todayDateKey(), addTime.value)
  if (!when.ok) {
    addError.textContent = when.message
    return
  }
  const glucose = readAddGlucose()
  if (glucose === null) {
    addError.textContent = 'Enter a glucose reading above 0.'
    return
  }
  const carbs = readOptionalAmount(addCarbs, 500)
  if (carbs === null) {
    addError.textContent = 'Enter carbohydrate from 0 to 500 grams.'
    return
  }
  const insulin = readOptionalAmount(addInsulin, 100)
  if (insulin === null) {
    addError.textContent = 'Enter insulin from 0 to 100 units.'
    return
  }
  const settings = readSettings()
  const entry = createLogEntry(
    {
      glucoseMmol: glucose,
      insulinUnits: insulin,
      insulinStep: insulinStepFor(insulin),
      targetMmol: settingsAreValid(settings) ? settings.targetMmol : DEFAULT_SETTINGS.targetMmol,
      carbsGrams: carbs,
      note: addNote.value,
    },
    when.at,
  )
  const entries = loadLog()
  entries.push(entry)
  saveLog(entries)
  addGlucose.value = ''
  addCarbs.value = ''
  addInsulin.value = ''
  addNote.value = ''
  addError.textContent = ''
  logAddForm.hidden = true
  logAddOpen.hidden = false
  paintLog(loadLog())
})

function currentClock(): { date: string; time: string } {
  const now = new Date()
  const zone = browserTimeZone()
  const minutes = logMinutesOfDay(now.toISOString(), zone)
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0')
  const minute = String(minutes % 60).padStart(2, '0')
  return { date: todayDateKey(zone, now), time: `${hour}:${minute}` }
}

function readWhen(dateKey: string, time: string): { ok: true; at: Date } | { ok: false; message: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, message: 'Choose a date and time.' }
  }
  if (dateKey > todayDateKey()) return { ok: false, message: 'Choose a time that has already happened.' }
  const at = dateInTimeZone(dateKey, time, browserTimeZone())
  if (!at) return { ok: false, message: 'That time does not exist on this day.' }
  if (at.getTime() > Date.now() + 60_000) return { ok: false, message: 'Choose a time that has already happened.' }
  return { ok: true, at }
}

function readOptionalAmount(input: HTMLInputElement, max: number): number | null {
  const raw = input.value.trim()
  if (!raw) return 0
  const parsed = parseDecimal(raw)
  if (parsed === null || parsed < 0 || parsed > max) return null
  return Math.round(parsed * 100) / 100
}

function readAddGlucose(): number | null {
  const parsed = parseDecimal(addGlucose.value)
  if (parsed === null || parsed <= 0) return null
  if (glucoseUnit === 'mgdl') {
    const mg = Math.round(parsed)
    if (mg <= 0 || mg > MMOL_MAX * 18) return null
    return mg / 18
  }
  const mmol = Math.round(parsed * 10) / 10
  if (mmol <= 0 || mmol > MMOL_MAX) return null
  return mmol
}

logAddOpen.addEventListener('click', () => {
  if (!addTime.value) addTime.value = currentClock().time
  logAddForm.hidden = false
  logAddOpen.hidden = true
  logAddForm.scrollIntoView({ block: 'nearest' })
})
logAddClose.addEventListener('click', () => {
  logAddForm.hidden = true
  logAddOpen.hidden = false
  addError.textContent = ''
})
logOpen.addEventListener('click', () => {
  if (!addTime.value) addTime.value = currentClock().time
  paintLog(loadLog())
  logDialog.showModal()
})
logPrev.addEventListener('click', () => {
  selectedLogKey = shiftDateKey(selectedLogKey || todayDateKey(), -1)
  paintLog(loadLog())
})
logNext.addEventListener('click', () => {
  const today = todayDateKey()
  const next = shiftDateKey(selectedLogKey || today, 1)
  selectedLogKey = next > today ? today : next
  paintLog(loadLog())
})
logCalendar.addEventListener('click', () => {
  try {
    logDate.showPicker()
  } catch {
    logDate.focus()
  }
})
logDate.addEventListener('change', () => {
  const today = todayDateKey()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate.value)) return
  selectedLogKey = logDate.value > today ? today : logDate.value
  paintLog(loadLog())
})
logList.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove]')
  if (!button?.dataset.remove) return
  saveLog(loadLog().filter((entry) => entry.id !== button.dataset.remove))
  paintLog(loadLog())
})
logClose.addEventListener('click', () => logDialog.close())
closeOnBackdrop(logDialog)

aboutOpen.addEventListener('click', () => aboutDialog.showModal())
aboutClose.addEventListener('click', () => aboutDialog.close())
closeOnBackdrop(aboutDialog)

const INSTALL_DISMISSED_KEY = 'insulin-calculator.install-dismissed'

type InstallPrompt = { prompt: () => Promise<void>; userChoice: Promise<unknown> }
let deferredPrompt: InstallPrompt | null = null

function installDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function runningAsApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function installCopy(): string {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'To install, tap Share, then Add to Home Screen.'
  const safari = /safari/i.test(ua) && !/chrome|chromium|android|crios|fxios|edg/i.test(ua)
  if (safari) return 'To install, choose File, then Add to Dock.'
  return 'Install this calculator on your home screen.'
}

function showInstall() {
  if (runningAsApp() || installDismissed()) {
    installEl.hidden = true
    return
  }
  const ua = navigator.userAgent
  const manual = /iphone|ipad|ipod/i.test(ua) || (/safari/i.test(ua) && !/chrome|chromium|android|crios|fxios|edg/i.test(ua))
  installText.textContent = installCopy()
  installButton.hidden = manual
  installEl.hidden = false
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt = event as unknown as InstallPrompt
  showInstall()
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  installEl.hidden = true
})

installButton.addEventListener('click', async () => {
  if (!deferredPrompt) return
  await deferredPrompt.prompt()
  installEl.hidden = true
  deferredPrompt = null
})

installDismiss.addEventListener('click', () => {
  installEl.hidden = true
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
  } catch {
    // Private browsing can block storage. The banner still closes for this view.
  }
})

showInstall()

const ratios = document.querySelector<HTMLDetailsElement>('#ratios')!
ratios.open = false
window.addEventListener('pageshow', (event) => {
  if (event.persisted) ratios.open = false
})

loadSettings()
const loggedTarget = latestTargetMmol(loadLog())
glucoseFromLog = loggedTarget !== null
writeGlucoseFromMmol(loggedTarget ?? 6)
render()
