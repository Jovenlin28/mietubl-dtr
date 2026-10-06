export interface EmployeeLog {
  log_date: string;
  time_in: string | null;
  time_out: string | null;
  in_address: string | null;
  out_address: string | null;
  edited: number;
  edit_reason: string | null;
}

export interface LeaveBalance {
  category: string;
  credits: string;
}

export interface LeaveRequest {
  id: number;
  category: string;
  days: number;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export const today = () => new Date().toLocaleDateString('en-CA');
