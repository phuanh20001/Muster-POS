export function snapToHalfHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${m < 30 ? '00' : '30'}`
}

export function stepHalfHour(hhmm, deltaMinutes) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + deltaMinutes) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function formatHalfHourDisplay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const dh = h % 12 || 12
  return `${dh}:${String(m).padStart(2, '0')} ${period}`
}

export function isHalfHourDate(d) {
  const m = d.getMinutes()
  return m === 0 || m === 30
}

export function isHalfHourHhmm(hhmm) {
  const m = parseInt(hhmm.split(':')[1], 10)
  return m === 0 || m === 30
}
