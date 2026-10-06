import { Card, CardContent } from '@/components/ui/card';
import type { LeaveBalance } from './types';

export default function LeaveBalanceCards({ balances }: { balances: LeaveBalance[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {balances.map((balance) => (
        <Card key={balance.category}>
          <CardContent className="pt-5">
            <p className="tnum text-3xl font-bold">{Number(balance.credits)}</p>
            <p className="text-sm capitalize text-muted-foreground">{balance.category} credits left</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
