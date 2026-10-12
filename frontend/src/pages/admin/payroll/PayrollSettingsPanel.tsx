import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import type { PayrollSettings } from './types';

interface PayrollSettingsPanelProps {
  settings: PayrollSettings;
  busy: boolean;
  onChange: (settings: PayrollSettings) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}

export function PayrollSettingsPanel({ settings, busy, onChange, onSave }: PayrollSettingsPanelProps) {
  const update = (values: Partial<PayrollSettings>) => onChange({ ...settings, ...values });
  const valid = settings.firstPayDay < settings.secondPayDay &&
    settings.requiredDaysPerWeek >= 1 && settings.requiredDaysPerWeek <= 7 &&
    settings.requiredHoursPerDay > 0 && settings.breakHours >= 0 &&
    settings.breakHours < settings.requiredHoursPerDay &&
    settings.gracePeriodMinutes >= 0 && Boolean(settings.workdayStartTime);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly pay dates</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Set the recurring dates employees are paid. Payroll coverage periods remain the 1st–15th and 16th–last day of each month.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSave} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First pay date">
              <Select value={settings.firstPayDay} onChange={(event) => update({ firstPayDay: Number(event.target.value) })}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day === 31 ? 'Last day of month (31st)' : `${day}${day === 11 || day === 12 || day === 13 ? 'th' : day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th'}`}</option>)}
              </Select>
            </Field>
            <Field label="Second pay date">
              <Select value={settings.secondPayDay} onChange={(event) => update({ secondPayDay: Number(event.target.value) })}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day === 31 ? 'Last day of month (31st)' : `${day}${day === 11 || day === 12 || day === 13 ? 'th' : day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th'}`}</option>)}
              </Select>
            </Field>
          </div>
          <div className="border-t pt-4">
            <h3 className="font-medium">Work schedule requirements</h3>
            <p className="mt-1 text-sm text-muted-foreground">Company-wide baseline used for attendance review. Required work hours are hours actually worked, excluding the break.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Required days to work per week">
              <Input type="number" min="1" max="7" step="1" required value={settings.requiredDaysPerWeek} onChange={(event) => update({ requiredDaysPerWeek: Number(event.target.value) })} />
            </Field>
            <Field label="Required hours per workday">
              <Input type="number" min="0.25" max="24" step="0.25" required value={settings.requiredHoursPerDay} onChange={(event) => update({ requiredHoursPerDay: Number(event.target.value) })} />
            </Field>
            <Field label="Break per workday (hours)">
              <Input type="number" min="0" max="24" step="0.25" required value={settings.breakHours} onChange={(event) => update({ breakHours: Number(event.target.value) })} />
            </Field>
            <Field label="Workday start time">
              <Input type="time" required value={settings.workdayStartTime} onChange={(event) => update({ workdayStartTime: event.target.value })} />
            </Field>
            <Field label="Grace period (minutes)">
              <Input type="number" min="0" max="1440" step="1" required value={settings.gracePeriodMinutes} onChange={(event) => update({ gracePeriodMinutes: Number(event.target.value) })} />
            </Field>
          </div>
          <Button type="submit" disabled={busy || !valid}>Save settings</Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">For shorter months, dates that do not exist are moved to the last calendar day. Selecting the 31st always means the last day of that month.</p>
        <p className="mt-2 text-xs text-muted-foreground">A recorded arrival later than the workday start plus the grace period is used to calculate an actual-time-not-worked deduction when its payroll line is saved. Each arrival gets its own grace period; missing time-ins are not treated as late.</p>
      </CardContent>
    </Card>
  );
}
