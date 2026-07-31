'use client'

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const ORDINALS = [
  { value: '1', label: 'First' },
  { value: '2', label: 'Second' },
  { value: '3', label: 'Third' },
  { value: '4', label: 'Fourth' },
  { value: '-1', label: 'Last' },
]

export default function ReservationRecurrenceFields({ form, setForm }) {
  function patch(changes) {
    setForm((f) => ({ ...f, ...changes }))
  }

  function toggleDay(value) {
    setForm((f) => {
      const has = f.daysOfWeek.includes(value)
      return {
        ...f,
        daysOfWeek: has ? f.daysOfWeek.filter((d) => d !== value) : [...f.daysOfWeek, value],
      }
    })
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.repeat}
          onChange={(e) => patch({ repeat: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
        />
        <span className="text-sm font-medium text-gray-700">Repeat this booking</span>
      </label>

      {form.repeat && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-400">Repeats starting from the date above.</p>

          <div className="grid grid-cols-2 gap-2">
            {['WEEKLY', 'MONTHLY'].map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => patch({ frequency: freq })}
                className={`rounded-lg py-1.5 text-sm font-medium border transition-colors ${
                  form.frequency === freq
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {freq === 'WEEKLY' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>

          {form.frequency === 'WEEKLY' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Repeat on</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        form.daysOfWeek.includes(d.value)
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Every</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={form.intervalWeeks}
                  onChange={(e) => patch({ intervalWeeks: e.target.value })}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="text-xs font-medium text-gray-600">week(s)</span>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Week</label>
                <select
                  value={form.monthlyOrdinal}
                  onChange={(e) => patch({ monthlyOrdinal: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {ORDINALS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Weekday</label>
                <select
                  value={form.monthlyWeekday}
                  onChange={(e) => patch({ monthlyWeekday: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={String(d.value)}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const emptyRecurrence = {
  repeat: false,
  frequency: 'WEEKLY',
  daysOfWeek: [],
  intervalWeeks: '1',
  monthlyOrdinal: '1',
  monthlyWeekday: '1',
}

export function recurrenceFromSeries(series) {
  return {
    repeat: true,
    frequency: series.frequency,
    daysOfWeek: Array.isArray(series.daysOfWeek) ? series.daysOfWeek : [],
    intervalWeeks: String(series.intervalWeeks ?? 1),
    monthlyOrdinal: String(series.monthlyOrdinal ?? 1),
    monthlyWeekday: String(series.monthlyWeekday ?? 1),
  }
}

export function validateRepeatForm(form) {
  if (form.frequency === 'WEEKLY' && form.daysOfWeek.length === 0) {
    return 'Pick at least one weekday to repeat on'
  }
  return null
}

export function buildSeriesPayload(form) {
  return {
    name: form.name,
    phone: form.phone || null,
    partySize: parseInt(form.partySize),
    note: form.note || null,
    time: form.time,
    anchorDate: new Date(`${form.date}T00:00:00`).toISOString(),
    frequency: form.frequency,
    daysOfWeek: form.daysOfWeek,
    intervalWeeks: parseInt(form.intervalWeeks),
    monthlyOrdinal: parseInt(form.monthlyOrdinal),
    monthlyWeekday: parseInt(form.monthlyWeekday),
  }
}
