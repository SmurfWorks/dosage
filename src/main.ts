import { registerSW } from 'virtual:pwa-register'
import {
  BASAL_PERIODS,
  basalForDateTime,
  isBasalPeriod,
  minutesOfTime,
  parseBasals,
  periodHours,
  periodLabel,
  recordBasalAmount,
  type Basal,
  type BasalAmount,
  type BasalDose,
  type BasalPeriod,
} from './basal'
import { calculate, DEFAULT_SETTINGS, type Settings } from './calculator'
import { dayGraphSvg } from './day-graph'
import { describeDose } from './format'
import {
  browserTimeZone,
  continuedTarget,
  createLogEntry,
  dateInTimeZone,
  formatDateKey,
  formatLocalDateKey,
  formatInsulin,
  formatLogTime,
  hasTarget,
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
const netCarbsEl = document.querySelector<HTMLElement>('#net-carbs')!
const showFibreInput = document.querySelector<HTMLInputElement>('#show-fibre')!
const glucoseSource = document.querySelector<HTMLElement>('#glucose-source')!
const resultEl = document.querySelector<HTMLElement>('#result')!
const targetCard = document.querySelector<HTMLElement>('#target-card')!
const targetDetail = document.querySelector<HTMLElement>('#target-detail')!
const saveLogButton = document.querySelector<HTMLButtonElement>('#save-log')!
const withBasalWrap = document.querySelector<HTMLLabelElement>('#with-basal-wrap')!
const withBasalInput = document.querySelector<HTMLInputElement>('#with-basal')!
const withBasalLabel = document.querySelector<HTMLElement>('#with-basal-label')!
const basalList = document.querySelector<HTMLElement>('#basal-list')!
const saveNote = document.querySelector<HTMLElement>('#save-note')!
const toast = document.querySelector<HTMLElement>('#toast')!
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
const logAddDialog = document.querySelector<HTMLDialogElement>('#log-add-dialog')!
const logAddForm = document.querySelector<HTMLFormElement>('#log-add')!
const logAddButton = document.querySelector<HTMLButtonElement>('#log-add-button')!
const logAddDate = document.querySelector<HTMLElement>('#log-add-date')!
const addTime = document.querySelector<HTMLInputElement>('#add-time')!
const addHour = document.querySelector<HTMLInputElement>('#add-hour')!
const addMinute = document.querySelector<HTMLInputElement>('#add-minute')!
const meridiemButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-meridiem]')]
const addGlucose = document.querySelector<HTMLInputElement>('#add-glucose')!
const addGlucoseUnit = document.querySelector<HTMLElement>('#add-glucose-unit')!
const addCarbs = document.querySelector<HTMLInputElement>('#add-carbs')!
const addFibreWrap = document.querySelector<HTMLElement>('#add-fibre-wrap')!
const addFibre = document.querySelector<HTMLInputElement>('#add-fibre')!
const addNetCarbs = document.querySelector<HTMLElement>('#add-net-carbs')!
const addInsulin = document.querySelector<HTMLInputElement>('#add-insulin')!
const addInsulinUnit = document.querySelector<HTMLElement>('#add-insulin-unit')!
const addTarget = document.querySelector<HTMLInputElement>('#add-target')!
const addTargetUnit = document.querySelector<HTMLElement>('#add-target-unit')!
const addTargetHelp = document.querySelector<HTMLElement>('#add-target-help')!
const addNote = document.querySelector<HTMLTextAreaElement>('#add-note')!
const addNoteDetails = document.querySelector<HTMLDetailsElement>('#add-note-details')!
const addWithBasalWrap = document.querySelector<HTMLLabelElement>('#add-with-basal-wrap')!
const addWithBasal = document.querySelector<HTMLInputElement>('#add-with-basal')!
const addWithBasalLabel = document.querySelector<HTMLElement>('#add-with-basal-label')!
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
  sizeStepInput(targetWholeInput)
  sizeStepInput(targetDecimalInput)
  const atFloor = whole === 0 && decimal === 0
  const atCeiling = whole >= ceiling
  targetWholeDown.disabled = atFloor
  targetDecimalDown.disabled = atFloor
  targetWholeUp.disabled = atCeiling
  targetDecimalUp.disabled = atCeiling
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
  for (const part of document.querySelectorAll<HTMLElement>('.split input.tenth, .split .point')) {
    part.hidden = mgdl
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '.split button[id$="whole-up"], .split button[id$="whole-down"], .split button.tenth',
  )) {
    button.dataset.mmolLabel ??= button.getAttribute('aria-label') ?? ''
    const raise = button.id.endsWith('-up')
    const amount = button.classList.contains('tenth') ? 1 : 10
    button.setAttribute('aria-label', mgdl ? `${raise ? 'Raise' : 'Lower'} by ${amount} mg/dL` : button.dataset.mmolLabel)
  }
  wholeInput.setAttribute('aria-label', mgdl ? 'Glucose' : 'Whole number')
  targetWholeInput.setAttribute('aria-label', mgdl ? 'Target' : 'Target whole number')
  rangeLow.whole.setAttribute('aria-label', mgdl ? 'Low end of range' : 'Low end whole number')
  rangeHigh.whole.setAttribute('aria-label', mgdl ? 'High end of range' : 'High end whole number')
  carbEffect.whole.setAttribute('aria-label', mgdl ? 'Carbohydrate effect' : 'Carbohydrate effect whole number')
  insulinEffect.whole.setAttribute('aria-label', mgdl ? 'Insulin effect' : 'Insulin effect whole number')
  addGlucose.setAttribute('aria-label', `Glucose, ${glucoseUnitLabel(glucoseUnit)}`)
  addTarget.setAttribute('aria-label', `Target, ${glucoseUnitLabel(glucoseUnit)}`)
  glucoseUnitLabelEl.textContent = glucoseUnitLabel(glucoseUnit)
  addGlucoseUnit.textContent = glucoseUnitLabel(glucoseUnit)
  addTargetUnit.textContent = glucoseUnitLabel(glucoseUnit)
  addGlucose.placeholder = addTarget.placeholder = glucoseUnit === 'mgdl' ? '0' : '0.0'
  sizeStepInputs()
  for (const input of unitInputs) input.checked = input.value === glucoseUnit
}

function paintFibre() {
  showFibreInput.checked = showFibre
  fibreWrap.hidden = !showFibre
  addFibreWrap.hidden = !showFibre
  paintNetCarbs(netCarbsEl, readCarbs(), readFibre())
  paintNetCarbs(addNetCarbs, readOptionalAmount(addCarbs, 500) ?? 0, showFibre ? readOptionalAmount(addFibre, 500) ?? 0 : 0)
}

function paintNetCarbs(el: HTMLElement, carbs: number, fibre: number) {
  el.hidden = !(showFibre && fibre > 0)
  el.firstElementChild!.textContent = `Calculated carbs: ${Number(Math.max(0, carbs - fibre).toFixed(2))} g`
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
      paintBasalEditor([])
      applySettings({ ...DEFAULT_SETTINGS })
      saveSettings()
      return
    }
    const parsed = JSON.parse(saved) as Partial<Settings> & {
      glucoseUnit?: string
      showFibre?: boolean
      basals?: unknown
    }
    glucoseUnit = parsed.glucoseUnit === 'mgdl' ? 'mgdl' : 'mmol'
    showFibre = parsed.showFibre !== false
    paintBasalEditor(parseBasals(parsed.basals))
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
    paintBasalEditor([])
    applySettings({ ...DEFAULT_SETTINGS })
    saveSettings()
  }
}

const basalAmounts = new WeakMap<HTMLElement, BasalAmount[]>()

function readBasalRows(): Basal[] {
  const basals: Basal[] = []
  for (const row of basalList.querySelectorAll<HTMLElement>('.basal-row')) {
    const period = row.dataset.period
    const amounts = basalAmounts.get(row) ?? []
    if (!isBasalPeriod(period) || amounts.length === 0) continue
    basals.push({ period, amounts })
  }
  return basals
}

function basalChoiceLabel(dateKey: string | null, minutes: number | null): string {
  if (dateKey === null || minutes === null) return 'With Basal'
  const basal = basalForDateTime(readBasalRows(), dateKey, minutes)
  if (!basal) return 'With Basal'
  const amount = formatInsulin(basal.units, insulinStepFor(basal.units))
  return `With ${periodLabel(basal.period)} Basal Dosage (${amount})`
}

function checkedBasal(input: HTMLInputElement, dateKey: string, minutes: number): BasalDose | null {
  const wrap = input.closest('label')
  if (!input.checked || !wrap || wrap.hidden) return null
  return basalForDateTime(readBasalRows(), dateKey, minutes)
}

function paintAddBasal(configured = readBasalRows()) {
  const show = configured.length > 0
  addWithBasalWrap.hidden = !show
  if (!show) addWithBasal.checked = false
  const minutes = minutesOfTime(addTime.value)
  const dateKey = selectedLogKey || todayDateKey()
  addWithBasalLabel.textContent = basalChoiceLabel(show ? dateKey : null, show ? minutes : null)
}

function paintBasalChoice() {
  const configured = readBasalRows()
  const show = configured.length > 0
  withBasalWrap.hidden = !show
  if (!show) withBasalInput.checked = false
  const now = new Date()
  const minutes = logMinutesOfDay(now.toISOString(), browserTimeZone())
  withBasalLabel.textContent = show ? basalChoiceLabel(todayDateKey(browserTimeZone(), now), minutes) : 'With Basal'
  paintAddBasal(configured)
}

function basalHistoryText(amounts: BasalAmount[]): string {
  if (amounts.length < 2) return ''
  return amounts
    .slice(0, -1)
    .map((amount, index) => {
      const next = amounts[index + 1]!
      const until = formatLocalDateKey(shiftDateKey(next.from, -1))
      const dose = formatInsulin(amount.units, insulinStepFor(amount.units))
      return `${dose} until ${until}`
    })
    .join('\n')
}

function paintBasalHistory(row: HTMLElement) {
  const history = row.querySelector<HTMLElement>('.basal-history')
  if (!history) return
  history.textContent = basalHistoryText(basalAmounts.get(row) ?? [])
}

function commitBasalAmount(row: HTMLElement, clear = false) {
  const input = row.querySelector<HTMLInputElement>('.basal-units')
  const raw = input?.value.trim() ?? ''
  if (clear && raw === '') {
    basalAmounts.set(row, [])
    paintBasalHistory(row)
    return
  }
  const units = parseDecimal(raw)
  if (units === null || units <= 0 || units > 100) return
  const amounts = recordBasalAmount(basalAmounts.get(row) ?? [], units, todayDateKey())
  basalAmounts.set(row, amounts)
  paintBasalHistory(row)
}

function addBasalRow(period: BasalPeriod, basal?: Basal) {
  const row = document.createElement('div')
  row.className = 'basal-row'
  row.dataset.period = period
  row.innerHTML = `
    <p class="basal-period">${periodLabel(period)}</p>
    <div class="field">
      <input class="basal-units" type="text" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="${periodLabel(period)} basal amount, ${periodHours(period)}" />
      <span class="basal-hours">${periodHours(period)}</span>
    </div>
    <p class="basal-history"></p>
  `
  const amounts = basal ? basal.amounts.map((amount) => ({ ...amount })) : []
  basalAmounts.set(row, amounts)
  const latest = amounts[amounts.length - 1]
  row.querySelector<HTMLInputElement>('.basal-units')!.value = latest ? String(latest.units) : ''
  paintBasalHistory(row)
  basalList.append(row)
}

function paintBasalEditor(basals: Basal[]) {
  basalList.replaceChildren()
  for (const period of BASAL_PERIODS) addBasalRow(period, basals.find((basal) => basal.period === period))
}

function saveSettings() {
  const settings = readSettings()
  if (!settingsAreValid(settings)) return
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...settings, glucoseUnit, showFibre, basals: readBasalRows() }),
  )
}

function readDigits(input: HTMLInputElement, max: number): number {
  const digits = input.value.replace(/\D/g, '')
  if (!digits) return 0
  return Math.min(max, Number(digits))
}

function bigStep(): number {
  return glucoseUnit === 'mgdl' ? 10 : 1
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

const textMeasure = document.createElement('canvas').getContext('2d')!

function sizeStepInput(input: HTMLInputElement) {
  const value = input.value.trim()
  const next = input.nextElementSibling
  if (next instanceof HTMLElement && next.classList.contains('ghost-decimal')) {
    let ghostText = ''
    if (value && input.placeholder.includes('.')) {
      ghostText = value.endsWith('.') ? '0' : value.includes('.') ? '' : '.0'
    }
    next.textContent = ghostText
    next.hidden = !ghostText
  }
  const style = getComputedStyle(input)
  textMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const width = textMeasure.measureText(input.value || input.placeholder || '0').width
  input.style.width = `${Math.ceil(width) + 2}px`
  input.style.textAlign = 'center'
}

function sizeStepInputs() {
  for (const input of document.querySelectorAll<HTMLInputElement>('.split input')) sizeStepInput(input)
}

function writeSplit(field: SplitField, whole: number, decimal: number) {
  const ceiling = splitCeiling(field)
  field.whole.value = String(whole)
  field.decimal.value = String(decimal)
  sizeStepInput(field.whole)
  sizeStepInput(field.decimal)
  const atFloor = whole === 0 && decimal === 0
  const atCeiling = whole >= ceiling
  field.wholeDown.disabled = atFloor
  field.decimalDown.disabled = atFloor
  field.wholeUp.disabled = atCeiling
  field.decimalUp.disabled = atCeiling
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
  field.wholeDown.addEventListener('click', () => stepSplitWhole(field, -bigStep()))
  field.wholeUp.addEventListener('click', () => stepSplitWhole(field, bigStep()))
  field.decimalDown.addEventListener('click', () =>
    glucoseUnit === 'mgdl' ? stepSplitWhole(field, -1) : stepSplitDecimal(field, -1),
  )
  field.decimalUp.addEventListener('click', () =>
    glucoseUnit === 'mgdl' ? stepSplitWhole(field, 1) : stepSplitDecimal(field, 1),
  )
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
  sizeStepInput(wholeInput)
  sizeStepInput(decimalInput)
  const atFloor = whole === 0 && decimal === 0
  const atCeiling = whole >= ceiling
  wholeDown.disabled = atFloor
  decimalDown.disabled = atFloor
  wholeUp.disabled = atCeiling
  decimalUp.disabled = atCeiling
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

function netCarbs(carbs: number): number {
  return Math.max(0, carbs - readFibre())
}

let selectedLogKey = ''
let latestFirst = true

function continuedFromLabel(source: LogEntry | null, current: LogEntry): string {
  if (!source) return 'from your routine'
  const time = formatLogTime(source.at, source.timeZone)
  if (logDateKey(source.at, source.timeZone) === logDateKey(current.at, current.timeZone)) return `from ${time}`
  const date = new Date(source.at)
  try {
    const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: source.timeZone }).format(date)
    return `from ${day}, ${time}`
  } catch {
    return `from ${time}`
  }
}

function paintLog(entries: LogEntry[]) {
  const today = todayDateKey()
  if (!selectedLogKey || selectedLogKey > today) selectedLogKey = today
  logDate.value = selectedLogKey
  logDate.max = today
  logNext.disabled = selectedLogKey >= today
  logDateLabel.textContent = formatDateKey(selectedLogKey)
  logAddButton.textContent = `Save for ${formatLocalDateKey(selectedLogKey)}`
  logAddDate.textContent = formatDateKey(selectedLogKey)

  const dayEntries = entries
    .filter((entry) => logDateKey(entry.at, entry.timeZone) === selectedLogKey)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
  if (latestFirst) dayEntries.reverse()
  const { rangeLow: low, rangeHigh: high } = readSettings()
  const range = low > 0 && high > low ? { low, high } : undefined
  const value = (mmol: number) => {
    const text = escapeHtml(formatGlucose(mmol, glucoseUnit))
    if (range === undefined) return `<span class="log-value">${text}</span>`
    const inside = mmol >= range.low && mmol <= range.high
    return inside
      ? `<span class="log-value is-in-range" title="Inside target range">${text}</span>`
      : `<span class="log-value is-out-of-range" title="Outside target range">${text}</span>`
  }
  const unit = glucoseUnitLabel(glucoseUnit)
  const stat = (kind: string, label: string, detail: string, shown: string) =>
    `<dl class="log-stat is-${kind}"><dt>${escapeHtml(label)}<span>${escapeHtml(detail)}</span></dt><dd>${shown}</dd></dl>`
  const arrow = (position: 'in' | 'out') =>
    `<svg class="log-arrow is-${position}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"></path></svg>`
  const amount = (figure: string) => `<span class="log-value is-neutral">${escapeHtml(figure)}</span>`
  const items = dayEntries
    .map((entry) => {
      const units = (count: number) => (count === 1 ? 'unit' : 'units')
      const inputs = [
        entry.carbsGrams == null || entry.carbsGrams <= 0
          ? ''
          : stat('carbs', 'Carbs', 'grams', amount(Number(entry.carbsGrams.toFixed(2)).toString())),
        entry.insulinUnits <= 0
          ? ''
          : stat('bolus', 'Bolus', units(entry.insulinUnits), amount(formatInsulin(entry.insulinUnits, entry.insulinStep).split(' ')[0])),
        entry.basalUnits == null || entry.basalUnits <= 0
          ? ''
          : stat('basal', 'Basal', units(entry.basalUnits), amount(Number(entry.basalUnits.toFixed(2)).toString())),
      ].join('')
      const group = `${arrow('in')}<div class="log-inputs">${
        inputs || '<p class="log-inputs-empty">No Carbs or Insulin dosed at this time</p>'
      }</div>`
      const ownTarget = hasTarget(entry)
      const continued = ownTarget ? null : continuedTarget(entries, entry.at, readSettings().targetMmol)
      const targetMmol = ownTarget ? entry.targetMmol : continued!.mmol
      const targetStat = ownTarget
        ? stat('target', 'Target', unit, value(targetMmol))
        : `<dl class="log-stat is-target is-continued"><dt>Target<span>${escapeHtml(unit)}</span></dt><dd>${value(targetMmol)}</dd></dl>`
      const result = `${arrow('out')}${targetStat}`
      const glucose = stat('glucose', 'Glucose', unit, value(entry.glucoseMmol))
      const stats = `${glucose}${group}${result}`
      const time = formatLogTime(entry.at, entry.timeZone)
      const continuedNote = continued
        ? `<p class="log-continued-note">Target carried forward ${escapeHtml(continuedFromLabel(continued.source, entry))}</p>`
        : ''
      const note = entry.note ? `<p class="log-entry-note">${escapeHtml(entry.note)}</p>` : ''
      const custom = entry.custom ? '<span class="log-custom">Custom Log Entry</span>' : ''
      return `<li class="log-entry"><div class="log-entry-head"><time datetime="${escapeHtml(entry.at)}">${escapeHtml(time)}</time><div class="log-entry-actions">${custom}<button type="button" class="log-remove" data-remove="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(time)}">×</button></div></div><div class="log-card"><div class="log-stats">${stats}</div></div>${continuedNote}${note}</li>`
    })
    .join('')
  const entriesOn = (key: string) =>
    entries
      .filter((entry) => logDateKey(entry.at, entry.timeZone) === key)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const neighbours = {
    before: entriesOn(shiftDateKey(selectedLogKey, -1)).at(-1),
    after: entriesOn(shiftDateKey(selectedLogKey, 1))[0],
  }
  const graph = dayEntries.length === 0 ? '' : dayGraphSvg(dayEntries, glucoseUnit, neighbours, range)
  const empty = dayEntries.length === 0 ? '<p class="log-empty">Nothing saved this day.</p>' : ''
  const orderLabel = latestFirst ? 'Latest first' : 'Earliest first'
  const nextLabel = latestFirst ? 'Earliest first' : 'Latest first'
  const list = items
    ? `<div class="log-entries-head"><h3 class="section-heading">Log entries</h3></div><div class="log-timeline ${latestFirst ? 'time-up' : 'time-down'}"><button type="button" class="log-direction" data-order aria-label="${orderLabel}. Show ${nextLabel}"></button><ol class="log-entries">${items}</ol></div>`
    : ''
  logList.innerHTML = `<section class="card log-day-card">${graph}${empty}</section>${list}`
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
  paintNetCarbs(netCarbsEl, readCarbs(), readFibre())
  try {
    renderDose()
  } finally {
    paintBasalChoice()
  }
}

function renderDose() {
  const settings = readSettings()
  const glucose = readGlucoseMmol()
  const carbs = readCarbs()
  const fibre = readFibre()
  const unitLabel = glucoseUnitLabel(glucoseUnit)
  saveNote.textContent = ''
  saveNote.classList.remove('is-error')
  glucoseSource.hidden = !glucoseFromLog
  resultEl.hidden = false
  targetCard.hidden = true

  if (!(glucose > 0)) {
    resultEl.className = 'result insulin'
    resultEl.innerHTML = `
      <p class="kicker">Calculated bolus</p>
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

  const copy = describeDose(result.value, {
    glucoseMmol: glucose,
    carbsGrams: carbs,
    settings,
    glucoseUnit,
  })
  const working = copy.working.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
  const noBolus = result.value.insulinUnits <= 0
  const headline = noBolus
    ? '<p class="no-bolus-copy">No bolus dosage required</p>'
    : `<p class="kicker">${escapeHtml(copy.kicker)}</p>
    <p class="figure">${escapeHtml(copy.figure)}<span>${escapeHtml(copy.unit)}</span></p>`
  resultEl.className = `result ${noBolus ? 'no-bolus' : result.value.action}`
  resultEl.innerHTML = headline
  targetDetail.innerHTML = `
    <div class="result insulin"><p class="figure">${escapeHtml(copy.after)}<span>${escapeHtml(copy.afterUnit)}</span></p></div>
    ${copy.carbCallout ? `<p class="carb-callout">${escapeHtml(copy.carbCallout)}</p>` : ''}
    <details class="working">
      <summary>Show the working</summary>
      <ul>${working}</ul>
    </details>
  `
  targetCard.hidden = !(carbs > 0 || !noBolus || copy.carbCallout)
}

form.addEventListener('submit', (event) => event.preventDefault())

wholeDown.addEventListener('click', () => stepWhole(-bigStep()))
wholeUp.addEventListener('click', () => stepWhole(bigStep()))
decimalDown.addEventListener('click', () => (glucoseUnit === 'mgdl' ? stepWhole(-1) : stepDecimal(-1)))
decimalUp.addEventListener('click', () => (glucoseUnit === 'mgdl' ? stepWhole(1) : stepDecimal(1)))

wholeInput.addEventListener('keydown', (event) => {
  if (glucoseUnit !== 'mmol') return
  if (event.key !== '.' && event.code !== 'NumpadDecimal') return
  event.preventDefault()
  decimalInput.focus()
  decimalInput.select()
})

wholeInput.addEventListener('input', () => {
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
  glucoseFromLog = false
  const decimal = decimalInput.value.replace(/\D/g, '').slice(-1) || '0'
  const parts = readGlucoseParts()
  writeGlucose(parts.whole, parts.whole >= MMOL_MAX ? 0 : Number(decimal))
  render()
})

targetWholeDown.addEventListener('click', () => stepTargetWhole(-bigStep()))
targetWholeUp.addEventListener('click', () => stepTargetWhole(bigStep()))
targetDecimalDown.addEventListener('click', () => (glucoseUnit === 'mgdl' ? stepTargetWhole(-1) : stepTargetDecimal(-1)))
targetDecimalUp.addEventListener('click', () => (glucoseUnit === 'mgdl' ? stepTargetWhole(1) : stepTargetDecimal(1)))

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

function stepCarbs(delta: number) {
  carbsInput.value = String(Number(Math.max(0, readCarbs() + delta).toFixed(2)))
  carbsInput.dispatchEvent(new Event('input', { bubbles: true }))
}

document.querySelector('#carbs-down-10')!.addEventListener('click', () => stepCarbs(-10))
document.querySelector('#carbs-up-10')!.addEventListener('click', () => stepCarbs(10))
document.querySelector('#carbs-down-1')!.addEventListener('click', () => stepCarbs(-1))
document.querySelector('#carbs-up-1')!.addEventListener('click', () => stepCarbs(1))

function stepFibre(delta: number) {
  const current = parseDecimal(fibreInput.value) ?? 0
  fibreInput.value = String(Number(Math.max(0, current + delta).toFixed(2)))
  fibreInput.dispatchEvent(new Event('input', { bubbles: true }))
}

document.querySelector('#fibre-down-10')!.addEventListener('click', () => stepFibre(-10))
document.querySelector('#fibre-up-10')!.addEventListener('click', () => stepFibre(10))
document.querySelector('#fibre-down-1')!.addEventListener('click', () => stepFibre(-1))
document.querySelector('#fibre-up-1')!.addEventListener('click', () => stepFibre(1))

carbsInput.addEventListener('input', () => {
  glucoseFromLog = false
  render()
})
fibreInput.addEventListener('input', () => {
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
  paintBasalEditor([])
  withBasalInput.checked = false
  addWithBasal.checked = false
  applySettings({ ...DEFAULT_SETTINGS })
  saveSettings()
  saveLog([])
  carbsInput.value = '0'
  fibreInput.value = '0'
  entryNote.value = ''
  entryNoteDetails.open = false
  clearAddForm()
  glucoseFromLog = false
  writeGlucoseFromMmol(6)
  render()
  if (logDialog.open) paintLog([])
})

function revealNote(details: HTMLDetailsElement, note: HTMLTextAreaElement) {
  if (!details.open) return
  requestAnimationFrame(() => {
    note.focus({ preventScroll: true })
    const card = details.closest<HTMLElement>('.card') ?? details
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    card.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' })
  })
}
entryNoteDetails.addEventListener('toggle', () => revealNote(entryNoteDetails, entryNote))
addNoteDetails.addEventListener('toggle', () => revealNote(addNoteDetails, addNote))

entryNote.addEventListener('input', () => {
  render()
})

let toastTimer = 0

function showToast(message: string) {
  window.clearTimeout(toastTimer)
  toast.textContent = message
  if (toast.matches(':popover-open')) toast.hidePopover()
  toast.classList.remove('is-visible')
  toast.showPopover()
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('is-visible')))
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible')
    toastTimer = window.setTimeout(() => toast.hidePopover(), 400)
  }, 3000)
}

function storeLogEntry(payload: {
  glucoseMmol: number
  insulinUnits: number
  insulinStep: number
  targetMmol: number
  carbsGrams: number
}) {
  const now = new Date()
  const zone = browserTimeZone()
  const basal = checkedBasal(withBasalInput, todayDateKey(zone, now), logMinutesOfDay(now.toISOString(), zone))
  const entry = createLogEntry(
    { ...payload, note: entryNote.value, basalUnits: basal?.units ?? null, basalPeriod: basal?.period ?? null },
    now,
  )
  const entries = loadLog()
  entries.push(entry)
  saveLog(entries)
  carbsInput.value = '0'
  fibreInput.value = '0'
  entryNote.value = ''
  entryNoteDetails.open = false
  withBasalInput.checked = false
  const loggedTarget = latestTargetMmol(entries)
  if (loggedTarget !== null) {
    glucoseFromLog = true
    writeGlucoseFromMmol(loggedTarget)
  }
  render()
  selectedLogKey = logDateKey(entry.at, entry.timeZone)
  if (!addTime.value) addTime.value = currentClock().time
  paintLog(loadLog())
  if (!logDialog.open) logDialog.showModal()
  showToast(`Saved log entry for ${formatLogTime(entry.at, entry.timeZone)}`)
}

saveLogButton.addEventListener('click', () => {
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
    targetMmol: result.value.projectedMmol,
    carbsGrams: netCarbs(carbs),
  })
})

logAddForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const when = readWhen(selectedLogKey || todayDateKey(), addTime.value)
  if (!when.ok) {
    addError.textContent = when.message
    return
  }
  const glucose = readGlucoseField(addGlucose)
  if (glucose === null) {
    addError.textContent = 'Enter a glucose reading above 0.'
    return
  }
  const carbs = readOptionalAmount(addCarbs, 500)
  if (carbs === null) {
    addError.textContent = 'Enter carbohydrate from 0 to 500 grams.'
    return
  }
  const fibre = showFibre ? readOptionalAmount(addFibre, 500) : 0
  if (fibre === null) {
    addError.textContent = 'Enter fibre from 0 to 500 grams.'
    return
  }
  const insulin = readOptionalAmount(addInsulin, 100)
  if (insulin === null) {
    addError.textContent = 'Enter insulin from 0 to 100 units.'
    return
  }
  const netCarbGrams = Math.max(0, carbs - fibre)
  const target = addTarget.value.trim() ? readGlucoseField(addTarget) : addTargetMmol(glucose, netCarbGrams, insulin)
  if (target === null) {
    addError.textContent = 'Enter a target above 0.'
    return
  }
  const basal = checkedBasal(
    addWithBasal,
    logDateKey(when.at.toISOString(), browserTimeZone()),
    logMinutesOfDay(when.at.toISOString(), browserTimeZone()),
  )
  const entry = createLogEntry(
    {
      glucoseMmol: glucose,
      insulinUnits: insulin,
      insulinStep: insulinStepFor(insulin),
      targetMmol: target,
      carbsGrams: netCarbGrams,
      custom: true,
      note: addNote.value,
      basalUnits: basal?.units ?? null,
      basalPeriod: basal?.period ?? null,
    },
    when.at,
  )
  const entries = loadLog()
  entries.push(entry)
  saveLog(entries)
  clearAddForm()
  logAddDialog.close()
  paintAddBasal()
  paintLog(loadLog())
  showToast(`Saved log entry for ${formatLogTime(entry.at, entry.timeZone)}`)
})

let addTargetEdited = false

function clearAddForm() {
  addGlucose.value = ''
  addCarbs.value = ''
  addFibre.value = ''
  addInsulin.value = ''
  addTarget.value = ''
  addNote.value = ''
  addNoteDetails.open = false
  addWithBasal.checked = false
  addError.textContent = ''
  addTargetEdited = false
  addTargetHelp.hidden = false
  addNetCarbs.hidden = true
  paintAddInsulinUnit()
  sizeStepInputs()
}

function paintAddInsulinUnit() {
  addInsulinUnit.textContent = parseDecimal(addInsulin.value) === 1 ? 'unit' : 'units'
}

function addTargetMmol(glucose: number, netCarbGrams: number, insulin: number): number {
  const settings = readSettings()
  const { mmolRisePer10g, mmolFallPerUnit } = settingsAreValid(settings) ? settings : DEFAULT_SETTINGS
  return Math.max(0, glucose + netCarbGrams * (mmolRisePer10g / 10) - insulin * mmolFallPerUnit)
}

function paintAddTarget() {
  if (addTargetEdited) return
  const glucose = readGlucoseField(addGlucose)
  const carbs = readOptionalAmount(addCarbs, 500) ?? 0
  const fibre = showFibre ? readOptionalAmount(addFibre, 500) ?? 0 : 0
  const insulin = readOptionalAmount(addInsulin, 100) ?? 0
  addTarget.value = glucose === null ? '' : formatGlucose(addTargetMmol(glucose, Math.max(0, carbs - fibre), insulin), glucoseUnit)
}

function stepAddField(input: HTMLInputElement, size: 'big' | 'small', direction: number) {
  const mgdl = glucoseUnit === 'mgdl'
  const steps: Record<string, { big: number; small: number; decimals: number }> = {
    'add-glucose': { big: mgdl ? 10 : 1, small: mgdl ? 1 : 0.1, decimals: mgdl ? 0 : 1 },
    'add-target': { big: mgdl ? 10 : 1, small: mgdl ? 1 : 0.1, decimals: mgdl ? 0 : 1 },
    'add-carbs': { big: 10, small: 1, decimals: 0 },
    'add-fibre': { big: 10, small: 1, decimals: 0 },
    'add-insulin': { big: 1, small: readSettings().insulinStep || 0.5, decimals: 2 },
  }
  const step = steps[input.id]
  if (!step) return
  const current = parseDecimal(input.value) ?? 0
  const next = Math.max(0, current + direction * step[size])
  input.value = String(Number(next.toFixed(step.decimals)))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

logAddForm.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-step-input]')
  if (!button) return
  const input = document.getElementById(button.dataset.stepInput!) as HTMLInputElement | null
  if (!input) return
  stepAddField(input, button.dataset.stepSize === 'big' ? 'big' : 'small', Number(button.dataset.stepDir))
})

logAddForm.addEventListener('input', (event) => {
  const target = event.target as HTMLElement
  if (target === addTarget) {
    addTargetEdited = addTarget.value.trim() !== ''
    addTargetHelp.hidden = addTargetEdited
    if (!addTargetEdited) paintAddTarget()
    return
  }
  if (target === addInsulin) paintAddInsulinUnit()
  if (target === addCarbs || target === addFibre) {
    paintNetCarbs(addNetCarbs, readOptionalAmount(addCarbs, 500) ?? 0, showFibre ? readOptionalAmount(addFibre, 500) ?? 0 : 0)
  }
  if (target === addGlucose || target === addCarbs || target === addFibre || target === addInsulin) paintAddTarget()
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

function readGlucoseField(input: HTMLInputElement): number | null {
  const parsed = parseDecimal(input.value)
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
  paintAddTime()
  paintAddBasal()
  addError.textContent = ''
  addInsulin.placeholder = Number.isInteger(readSettings().insulinStep) ? '0' : '0.0'
  paintAddTarget()
  sizeStepInputs()
  logAddDialog.showModal()
})
logAddClose.addEventListener('click', () => {
  logAddDialog.close()
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
  paintAddBasal()
})
logNext.addEventListener('click', () => {
  const today = todayDateKey()
  const next = shiftDateKey(selectedLogKey || today, 1)
  selectedLogKey = next > today ? today : next
  paintLog(loadLog())
  paintAddBasal()
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
  paintAddBasal()
})
logList.addEventListener('click', (event) => {
  if ((event.target as Element).closest('[data-order]')) {
    latestFirst = !latestFirst
    paintLog(loadLog())
    logList.querySelector<HTMLButtonElement>('[data-order]')?.focus()
    return
  }
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

function onBasalEdit(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.classList.contains('basal-units')) return
  const row = target.closest<HTMLElement>('.basal-row')
  if (!row) return
  commitBasalAmount(row, event.type === 'change')
  saveSettings()
  render()
}
basalList.addEventListener('input', onBasalEdit)
basalList.addEventListener('change', onBasalEdit)
let addMeridiem: 'am' | 'pm' = 'am'

function paintAddTime() {
  const match = /^(\d{2}):(\d{2})$/.exec(addTime.value)
  if (!match) return
  const hours = Number(match[1])
  addMeridiem = hours >= 12 ? 'pm' : 'am'
  addHour.value = String(hours % 12 || 12)
  addMinute.value = match[2]
  paintMeridiem()
}

function paintMeridiem() {
  for (const button of meridiemButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.meridiem === addMeridiem))
  }
}

function syncAddTime() {
  const hour = Number(addHour.value)
  const minute = Number(addMinute.value)
  const valid =
    /^\d{1,2}$/.test(addHour.value) && /^\d{1,2}$/.test(addMinute.value) && hour >= 1 && hour <= 12 && minute <= 59
  const hours24 = (hour % 12) + (addMeridiem === 'pm' ? 12 : 0)
  addTime.value = valid ? `${String(hours24).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''
  paintAddBasal()
}

addHour.addEventListener('input', () => {
  syncAddTime()
  if (addHour.value.length === 2 || Number(addHour.value) > 1) addMinute.focus()
})
addMinute.addEventListener('input', syncAddTime)
addMinute.addEventListener('blur', () => {
  if (/^\d$/.test(addMinute.value)) addMinute.value = `0${addMinute.value}`
})
for (const button of meridiemButtons) {
  button.addEventListener('click', () => {
    addMeridiem = button.dataset.meridiem === 'pm' ? 'pm' : 'am'
    paintMeridiem()
    syncAddTime()
  })
}

const settingsDialog = document.querySelector<HTMLDialogElement>('#settings')!
document.querySelector<HTMLButtonElement>('#settings-open')!.addEventListener('click', () => settingsDialog.showModal())
document.querySelector<HTMLButtonElement>('#settings-close')!.addEventListener('click', () => settingsDialog.close())
closeOnBackdrop(settingsDialog)

document.addEventListener('input', () => queueMicrotask(sizeStepInputs))

loadSettings()
const loggedTarget = latestTargetMmol(loadLog())
glucoseFromLog = loggedTarget !== null
writeGlucoseFromMmol(loggedTarget ?? 6)
render()
sizeStepInputs()
