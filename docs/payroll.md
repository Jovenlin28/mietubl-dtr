# Payroll feature

This document describes the payroll workflow currently implemented in Mietubl DTR. It creates two monthly pay periods, pre-fills basic pay for monthly-paid employees, and calculates SSS and Pag-IBIG contributions from the saved monthly salary. Other earnings and deductions remain manual; this is not a complete automated Philippine payroll calculator.

## Who can use it

- **Admins** can configure recurring pay dates, assign compensation profiles to one or more employees, create and edit draft payroll runs, review DTR summaries, approve runs, and mark approved runs as paid.
- **Employees** can view their own payslips after a run is approved. Payslips remain available after the run is marked paid.
- Payroll administration routes require an authenticated admin account. The employee payslip endpoint uses the authenticated employee's ID; it does not accept a user ID from the request.

In the admin app, open **Payroll**. The **Settings** tab configures pay dates and work requirements, **Employee rates** assigns compensation to employees, and **Payroll periods** is where admins create, review, and approve pay periods. Employees can find **Payslips** in the employee navigation.

## Admin workflow

### 1. Configure pay dates

Set two recurring pay dates by selecting a day from 1 through 31, in chronological order. The 31st means the last calendar day of each month. If a selected date does not exist in a shorter month (for example, the 30th in February), payroll uses that month's last day. The defaults are the 15th and the last day of the month.

Pay dates are separate from coverage periods. The periods remain day 1–15 and day 16–month-end. For example, a business can configure the 12th and 27th as recurring pay dates without changing those coverage ranges. New payroll periods snapshot the configured pay date. Changing the settings does not change existing periods.

The **Work schedule requirements** section stores company-wide values for required workdays per week, required hours per workday, break hours per workday, workday start time, and grace period in minutes. The initial defaults are 5 workdays, 8 required work hours, a 1-hour break, an 08:00 start, and no grace period. Required work hours mean hours actually worked, excluding breaks. Workdays must be from 1 to 7, required hours must be greater than zero and no more than 24, break hours must be non-negative and less than required work hours, and the grace period can be from 0 to 1,440 minutes.

When an admin saves and reviews a draft payroll line, DTR arrivals in that coverage period are compared with the configured company-wide start time. The grace period applies separately to each recorded arrival. Missing `time_in` values do not count as late. The app does not store employee-specific shifts or scheduled weekdays, so each recorded arrival is treated as an expected workday; check edited logs, off-day work, approved leave, holidays, and schedules before approving payroll.

### 2. Set employee rates

Select a pay basis (monthly, hourly, or daily), enter one rate in PHP, and select one or more employees. Saving applies that same basis and rate to every selected employee. This action replaces each selected employee's existing profile.

For monthly-paid employees, enter the full monthly salary. It is split equally across both coverage periods when a month is created. The first half is rounded down to cents; any remaining cent is included in the second half. For example, PHP 15,000.01 is split into PHP 7,500.00 and PHP 7,500.01. Updating a profile affects future periods only; existing lines retain the pay basis, rate, and pay amounts they were created with.

Daily and hourly rates are stored for reference but are not automatically multiplied by DTR days or hours. Their basic pay starts at zero and must be entered by the admin.

### Statutory deductions

For employees whose pay basis is monthly, SSS and Pag-IBIG employee contributions are calculated from the saved monthly base salary (the employee's `pay_rate`), not from the half-month basic pay, overtime, or allowances. The full monthly employee contribution is deducted in the second payroll period; the first period's automatic contribution is zero. The amounts are saved on each payroll item when periods are created, so later rule changes do not recalculate existing slips.

The current rule schedule is versioned in `backend/src/payroll.ts` with an effective date of 2025-01-01. It uses the supplied schedule: SSS contribution rate of 15%, 5/15 employee share, monthly salary credit range PHP 5,000–35,000 with PHP 500 steps, employer EC of PHP 10/PHP 30 around the PHP 15,000 MSC threshold; Pag-IBIG salary base capped at PHP 10,000, employee rate of 1% at monthly salary up to PHP 1,500 and 2% above, and employer rate of 2%. A future schedule should be added with its effective date; calculations use the latest rule effective on the period pay date. Creating a period for an earlier unsupported pay date returns an error instead of applying newer rules retroactively.

The admin may override SSS and/or Pag-IBIG on an individual draft pay line. Leave the override field blank to use the saved automatic amount. Any override, including a zero amount, requires a reason of at least five characters. The override, reason, admin ID, and timestamp are saved for audit; clearing the override restores the stored calculated amount. Employer SSS, EC, and Pag-IBIG amounts are included in the employer-contributions field and are not deducted from employee net pay.

The statutory base currently uses monthly base salary only. Confirm that basis and the current schedules with your payroll/accounting adviser before production use; government rules, eligibility, and salary-base treatment can change and may include exceptions.

### Late deductions

The review table's **Late penalties** column previews a calculation from recorded DTR arrivals as soon as the draft period is opened. Click **Confirm & Save** to save the preview to the payroll item. This is intended to represent pay for actual time not worked, not a disciplinary fine; Philippine labor rules and applicable company policy should be checked with a qualified payroll adviser.

For every recorded arrival later than the configured workday start, the system rounds the tardiness up to a whole minute, subtracts the grace period for that arrival, and adds the remaining billable minutes. Missing arrivals do not incur an automatic deduction. The billable total is multiplied by the per-minute rate and rounded to cents:

- Monthly: `(monthly salary × 12 ÷ (required days per week × 52.2)) ÷ required hours per day ÷ 60`.
- Daily: `daily rate ÷ required hours per day ÷ 60`.
- Hourly: `hourly rate ÷ 60`.

For a monthly salary, 5 required workdays per week produce an annual factor of 261 days; the factor changes with the configured workdays per week. The calculation uses each payroll item's snapshotted pay rate and the current company settings at the time its line is saved. It stores billable late minutes and the deduction on the payroll item, includes the amount in total deductions and net pay, and displays it on the employee payslip. Re-saving a draft line recalculates the snapshot from current DTR and settings; approval locks the saved amount. This calculation does not assess whether a logged date was actually a scheduled workday, and edited time records should be verified before approval.

### Computed pay reference

The **Computed Pay (based on total logged hours)** column previews an amount derived from complete recorded time-in/time-out durations plus approved leave in the coverage period. An admin must click **Verify attendance** for each draft payroll line after checking the DTR and approved-leave records. This saves the computed hours and amount with the verifying admin and timestamp. Approved leave is treated as paid at the configured required hours per day. Where an approved request only partly overlaps the payroll period, its leave days are prorated by the calendar-day overlap. The app does not adjust for holidays or determine employee-specific scheduled weekdays. Incomplete DTR pairs contribute no logged hours.

The pay conversion uses the saved pay rate: monthly rates convert using `monthly salary × 12 ÷ (required days per week × 52.2) ÷ required hours per day`; daily rates divide by required hours per day; hourly rates are used directly. After attendance is verified, **Apply to Basic Pay** copies the verified amount into the editable Basic Pay field. The admin can then adjust that field before clicking **Confirm & Save**. Computed Pay is a reference until explicitly applied; it does not otherwise replace Basic Pay or enter gross/net calculations.

Changes to DTR logs, approval of a leave request, or payroll schedule settings invalidate affected draft attendance verifications and clear the line's review status. Recheck attendance, verify it again, and save the pay line before approving the payroll run. Payroll approval requires every employee line to have verified attendance and to be saved/reviewed.

### 3. Create periods for a month

Select a month to create two draft periods in one transaction:

- **First period:** day 1 through day 15, assigned the first configured pay date.
- **Second period:** day 16 through the last calendar day of that month, assigned the second configured pay date.

If either period already exists, creation is rejected and neither new period is kept. Each period gets one line for each account whose role is `employee` at creation time, using the employee's then-current name and compensation profile. Employees added later do not automatically appear in those periods.

The 50/50 monthly salary split does not prorate for hires, terminations, unpaid absences, or other partial-period situations. Review and adjust basic pay where required before approval.

### 4. Review and delete draft periods

Use **Review** to open a period's pay lines. Draft periods also have a delete action; deleting one permanently removes that period and its associated pay lines. The app asks for confirmation first. Only draft periods may be deleted; approved and paid periods are retained to preserve payroll history.

### 5. Review each employee's pay line

Review the pre-filled basic pay, then enter or adjust other amounts:

| Field | Meaning |
| --- | --- |
| Basic pay | Basic earnings for this payroll period |
| Additional earnings | Combined additional pay such as overtime, night-shift differential, holiday/rest-day premiums, or allowances |
| SSS, PhilHealth, Pag-IBIG | Employee deductions for the respective programs |
| Withholding tax | Employee withholding tax |
| Other deductions | Other employee deductions |
| Employer contributions | Employer-side contributions; excluded from employee net pay |

Amounts must be non-negative and no more than PHP 100,000,000 each. The displayed gross is **basic pay + additional earnings**. The displayed net is **gross − SSS − PhilHealth − Pag-IBIG − withholding tax − late deductions − other deductions**. Employer contributions are not part of either calculation.

The payroll page shows DTR log days, summed recorded hours, and edited log days for review. Review the employee's time records and approved leave, then click **Verify attendance** to snapshot the computed hours/pay and record the verifying admin and timestamp. **Apply to Basic Pay** copies that verified amount into Basic Pay, which remains editable. Click **Confirm & Save** to save the full pay line. The **Approve and lock** button stays disabled until every employee's attendance has been verified and each pay line has been confirmed and saved. An empty run cannot be approved.

Edits to DTR logs, approval of leave, or changes to payroll settings clear affected draft attendance verifications and review status. Verify attendance again and re-save each affected line before approval.

### 6. Approve and mark paid

Approval changes the run from `draft` to `approved` and records the approving admin and timestamp. The run's pay lines then become read-only. Employees can see approved runs as payslips.

An admin can mark an approved run as `paid`; the payment timestamp is recorded. This is a status record only—the application does not transfer funds or verify payment.

## Employee payslips

The Payslips page lists approved and paid runs belonging to the signed-in employee. Each slip displays its period, status, earnings, employee deductions (including late deductions and billable late minutes), gross earnings, total deductions, net pay, and employer contributions separately. Draft runs are not exposed through the employee endpoint.

## Philippine payroll and compliance boundaries

The feature calculates SSS and Pag-IBIG using the currently configured effective-dated schedule, but does not automatically calculate PhilHealth, withholding tax, or earnings such as overtime. It does not determine contribution eligibility, assess minimum-wage compliance, calculate 13th-month pay, create statutory filings, or export bank-payment files. Have the current schedules and policy checked by an authorized payroll professional.

Before approval, have amounts checked against current Philippine rules, applicable work location and wage orders, employee circumstances, and qualified payroll/accounting guidance. Do not treat this feature as a substitute for compliance review.

## Data model

The schema is initialized in `backend/src/db.ts`:

- `payroll_profiles` stores the employee's pay basis and reference rate.
- `payroll_settings` stores the two recurring pay days, company-wide weekly schedule requirements, workday start time, and grace period.
- `payroll_runs` stores the coverage period, snapshotted pay date, status, creator, approver, and approval/payment timestamps.
- `payroll_items` stores employee-specific earnings, deductions, computed-hours/pay snapshots and attendance-verifier audit fields, billable late minutes and late-deduction snapshots, calculated SSS/Pag-IBIG snapshots, optional override amounts and audit details, the statutory rule effective date, and the reviewer information.

Employee account deletion is blocked when the account is referenced by payroll history, to preserve the payroll audit trail. Keep former employees' accounts rather than deleting them.

## API endpoints

All paths below are relative to `/api`.

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /admin/payroll/employees` | Admin | List employee accounts and compensation profiles |
| `PUT /admin/payroll/employees/:id` | Admin | Create or update pay basis and reference rate |
| `PUT /admin/payroll/employees/bulk` | Admin | Apply one pay basis and rate to a list of employee IDs |
| `GET /admin/payroll/settings` | Admin | Read configured pay dates, work requirements, start time, and grace period |
| `PUT /admin/payroll/settings` | Admin | Save pay dates and work requirements (`firstPayDay`, `secondPayDay`, `requiredDaysPerWeek`, `requiredHoursPerDay`, `breakHours`, `workdayStartTime`, `gracePeriodMinutes`) |
| `GET /admin/payroll/runs` | Admin | List payroll runs with employee count, gross, and deductions totals |
| `POST /admin/payroll/months` | Admin | Create the first-half and second-half draft periods for a month (`{ "month": "YYYY-MM" }`) |
| `DELETE /admin/payroll/runs/:id` | Admin | Delete a draft period and its pay lines; approved and paid periods cannot be deleted |
| `GET /admin/payroll/runs/:id` | Admin | Get a run and pay lines with DTR review summaries |
| `POST /admin/payroll/runs/:runId/items/:itemId/attendance/verify` | Admin | Verify and snapshot attendance-based hours/pay, with verifier and timestamp |
| `PATCH /admin/payroll/runs/:runId/items/:itemId` | Admin | Save pay-line amounts, calculate and snapshot late deductions, and mark that line reviewed; attendance must be verified first |
| `PATCH /admin/payroll/runs/:id/status` | Admin | Approve a draft or mark an approved run paid |
| `GET /payroll/payslips?year=YYYY&month=M` | Authenticated employee | List the signed-in employee's approved and paid payslips for a selected month, plus available years |

Payroll API validation errors use the API's regular `400` input response. Duplicate periods return `409`; invalid workflow transitions and attempts to edit approved runs are also rejected.
