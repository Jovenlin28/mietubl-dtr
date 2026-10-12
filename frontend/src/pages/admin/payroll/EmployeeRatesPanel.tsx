import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import type { PayrollEmployee } from './types';
import { formatPeso } from './types';

interface EmployeeRatesPanelProps {
  employees: PayrollEmployee[];
  busy: boolean;
  onSave: (
    employeeIds: number[],
    payBasis: NonNullable<PayrollEmployee['payBasis']>,
    payRate: number,
  ) => Promise<void>;
}

export function EmployeeRatesPanel({ employees, busy, onSave }: EmployeeRatesPanelProps) {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [payBasis, setPayBasis] = useState<NonNullable<PayrollEmployee['payBasis']>>('monthly');
  const [payRate, setPayRate] = useState('');
  const employeeDropdownRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      const dropdown = employeeDropdownRef.current;
      if (dropdown?.open && event.target instanceof Node && !dropdown.contains(event.target)) {
        dropdown.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && employeeDropdownRef.current?.open) {
        employeeDropdownRef.current.open = false;
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const toggleEmployee = (employeeId: number) => {
    setSelectedEmployeeIds((selected) => selected.includes(employeeId)
      ? selected.filter((id) => id !== employeeId)
      : [...selected, employeeId]);
  };

  const toggleAllEmployees = () => {
    setSelectedEmployeeIds((selected) => selected.length === employees.length
      ? []
      : employees.map((employee) => employee.id));
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedEmployeeIds.length && payRate !== '') {
      void onSave(selectedEmployeeIds, payBasis, Number(payRate));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee rates</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Apply the same pay basis and rate to one or more employees. Monthly salaries are pre-filled at half per payroll period; daily and hourly pay must be entered in each run.</p>
      </CardHeader>
      <CardContent>
        {!employees.length
          ? <p className="text-sm text-muted-foreground">There are no employee accounts to set up.</p>
          : <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pay basis">
                <Select value={payBasis} onChange={(event) => setPayBasis(event.target.value as NonNullable<PayrollEmployee['payBasis']>)}>
                  <option value="monthly">Monthly salary</option>
                  <option value="hourly">Hourly salary</option>
                  <option value="daily">Daily salary</option>
                </Select>
              </Field>
              <Field label={payBasis === 'monthly' ? 'Monthly salary (PHP/month)' : payBasis === 'daily' ? 'Daily salary (PHP/day)' : 'Hourly salary (PHP/hour)'}>
                <Input type="number" min="0" max="100000000" step="0.01" required value={payRate} onChange={(event) => setPayRate(event.target.value)} />
              </Field>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">Employees</span>
              <details ref={employeeDropdownRef} className="group relative">
                <summary className="flex h-10 cursor-pointer list-none items-center justify-between rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="truncate">
                    {selectedEmployeeIds.length === 0
                      ? 'Select employees'
                      : selectedEmployeeIds.length === 1
                        ? employees.find((employee) => employee.id === selectedEmployeeIds[0])?.name
                        : `${selectedEmployeeIds.length} employees selected`}
                  </span>
                  <ChevronDown size={16} className="ml-2 shrink-0 text-muted-foreground transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-card p-1 shadow-lg">
                  <button
                    type="button"
                    className="w-full rounded-sm px-3 py-2 text-left text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={toggleAllEmployees}
                  >
                    {selectedEmployeeIds.length === employees.length ? 'Clear selection' : `Select all (${employees.length})`}
                  </button>
                  <div className="my-1 border-t" />
                  {employees.map((employee) => {
                    const selected = selectedEmployeeIds.includes(employee.id);
                    return (
                      <button
                        key={employee.id}
                        type="button"
                        aria-pressed={selected}
                        className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => toggleEmployee(employee.id)}
                      >
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm border ${
                            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground bg-background'
                          }`}
                          aria-hidden="true"
                        >
                          {selected && <Check size={13} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{employee.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {employee.payBasis ? `${employee.payBasis} · ${formatPeso(employee.payRate ?? 0)}` : 'No rate set'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </details>
            </div>
            <Button type="submit" disabled={busy || !selectedEmployeeIds.length || payRate === ''}>Save rate for {selectedEmployeeIds.length} employee{selectedEmployeeIds.length === 1 ? '' : 's'}</Button>
          </form>}
      </CardContent>
    </Card>
  );
}
