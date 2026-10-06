import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut as Out, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { EmployeeLog } from './types';

interface Location { lat: number; lng: number; accuracy: number; address?: string }

function useLocation() {
  const [location, setLocation] = useState<Location>();
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(true);

  const locate = useCallback(() => {
    setError('');
    setLocating(true);
    if (!window.isSecureContext) {
      setError('Location access requires a secure connection (HTTPS) or localhost.');
      setLocating(false);
      return;
    }
    if (!navigator.geolocation) {
      setError('This browser does not support location access.');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const nextLocation: Location = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
        setLocation(nextLocation);
        setLocating(false);
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${nextLocation.lat}&lon=${nextLocation.lng}`);
          if (!response.ok) return;
          const result = await response.json();
          setLocation({ ...nextLocation, address: result.display_name });
        } catch { /* coordinates are still shown */ }
      },
      (locationError) => {
        switch (locationError.code) {
          case locationError.PERMISSION_DENIED:
            setError('Location permission is denied. Allow location access for this site in your browser and device settings, then refresh.');
            break;
          case locationError.POSITION_UNAVAILABLE:
            setError('Your device could not determine your location. Check that device location services are on, then try again.');
            break;
          case locationError.TIMEOUT:
            setError('Location lookup timed out. Check your connection or move to an area with a clearer signal, then try again.');
            break;
          default:
            setError('Unable to get your location. Check your browser and device location settings, then try again.');
        }
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  useEffect(locate, [locate]);
  return { location, error, locate, locating };
}

export default function LocationTimeClock({ todayLog, onPunched }: { todayLog?: EmployeeLog; onPunched: () => void }) {
  const { location, error: locationError, locate, locating } = useLocation();
  const [now, setNow] = useState(new Date());
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const punch = async (kind: 'time-in' | 'time-out') => {
    if (!location) {
      setMessage('Waiting for your location…');
      return;
    }
    try {
      await api(`/logs/${kind}`, { method: 'POST', body: { lat: location.lat, lng: location.lng } });
      setMessage(kind === 'time-in' ? 'Timed in.' : 'Timed out.');
      onPunched();
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  return (
    <Card className="relative isolate overflow-hidden border-0 bg-[#123f40] shadow-lg">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-cover bg-[center_48%]"
        style={{ backgroundImage: "linear-gradient(90deg, rgb(8 38 41 / 76%) 0%, rgb(8 38 41 / 48%) 50%, rgb(8 38 41 / 22%) 100%), url('/dtr-login-background.svg')" }}
      />
      <CardContent className="relative grid gap-5 p-4 sm:p-6 md:grid-cols-[1.2fr_0.8fr] md:items-stretch">
        <div className="rounded-lg bg-slate-950/20 p-3 text-white backdrop-blur-[2px] md:bg-transparent md:p-2 md:backdrop-blur-0">
          <p className="text-sm text-white/80">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <p className="tnum text-4xl font-bold tracking-tight sm:text-5xl">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <div className="mt-4 flex gap-3">
            <Button size="lg" className="shadow-md" disabled={!!todayLog?.time_in} onClick={() => punch('time-in')}><LogIn />Time in</Button>
            <Button size="lg" variant="outline" className="border-white/80 bg-white/95 text-foreground hover:bg-white" disabled={!todayLog?.time_in || !!todayLog?.time_out} onClick={() => punch('time-out')}><Out />Time out</Button>
          </div>
          {message && <p role="status" className="mt-3 text-sm text-white">{message}</p>}
        </div>
        <div className="rounded-lg border border-white/60 bg-white/95 p-4 text-sm shadow-lg backdrop-blur-md sm:p-5">
          <p className="mb-1 flex items-center gap-1.5 font-medium"><MapPin size={16} />Your location</p>
          {location ? (
            <>
              <p>{location.address ?? 'Looking up address…'}</p>
              <p className="tnum mt-1 text-muted-foreground">{location.lat.toFixed(6)}, {location.lng.toFixed(6)} (±{Math.round(location.accuracy)} m)</p>
              {locationError && <p role="status" className="mt-2 text-destructive">{locationError}</p>}
            </>
          ) : <p role={locationError ? 'alert' : 'status'} className="text-muted-foreground">{locationError || (locating ? 'Finding you…' : 'Location unavailable.')}</p>}
          <Button variant="ghost" size="sm" className="mt-2 px-0" disabled={locating} onClick={locate}>
            {locating ? 'Getting location…' : 'Refresh location'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
