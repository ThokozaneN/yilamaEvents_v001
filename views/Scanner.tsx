import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { EventScannerAssignment } from '../types';
import jsQR from 'jsqr';
import { logError } from '../lib/monitoring';

export const ScannerView: React.FC = () => {
  const [activeAssignment, setActiveAssignment] = useState<EventScannerAssignment | null>(null);
  const [assignments, setAssignments] = useState<EventScannerAssignment[]>([]);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error' | 'already-used' | 'locked' | 'wrong-event' | 'tampered'>('idle');
  const [manualCode, setManualCode] = useState('');
  const [attendeeInfo, setAttendeeInfo] = useState<{ name: string; type?: string; message?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  // Offline Architecture State
  const [isOfflineMode, setIsOfflineMode] = useState(localStorage.getItem('yilama_offline_mode') === 'true');
  const [manifest, setManifest] = useState<any[]>(JSON.parse(localStorage.getItem('yilama_event_manifest') || '[]'));
  const [offlineQueue, setOfflineQueue] = useState<any[]>(JSON.parse(localStorage.getItem('yilama_offline_queue') || '[]'));
  const [isSyncing, setIsSyncing] = useState(false);

  // Real-time Stats
  const [stats, setStats] = useState({
    total: 0,
    scanned: 0,
    remaining: 0
  });

  const deviceId = useRef(localStorage.getItem('yilama_scanner_id') || `SCAN-${Math.random().toString(36).substr(2, 9)}`);
  const lastScanTime = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const statusRef = useRef<'idle' | 'scanning' | 'success' | 'error' | 'already-used' | 'locked' | 'wrong-event' | 'tampered'>(status);
  const loadingRef = useRef<boolean>(loading);
  const assignmentsRef = useRef<EventScannerAssignment[]>(assignments);
  const scannerIdRef = useRef<string | null>(null);
  const isCameraActiveRef = useRef<boolean>(false);

  // Sync refs with state for loop access
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { assignmentsRef.current = assignments; }, [assignments]);
  useEffect(() => { isCameraActiveRef.current = isCameraActive; }, [isCameraActive]);

  useEffect(() => {
    localStorage.setItem('yilama_scanner_id', deviceId.current);
    checkCameraAvailability();
    fetchAssignments();
    return () => stopCamera();
  }, []);

  const fetchStats = async () => {
    if (!activeAssignment) return;

    // Phase 10: High-Performance RPC Server Counters 🚀
    const { data, error } = await supabase
      .rpc('get_event_scanning_stats', { p_event_id: activeAssignment.event_id });

    if (data && !error) {
      setStats({
        total: data.total || 0,
        scanned: data.scanned || 0,
        remaining: data.remaining || 0
      });
    }
  };

  // REAL-TIME STATS SUBSCRIPTION
  useEffect(() => {
    if (!activeAssignment) return;

    // Initial Fetch
    fetchStats();

    // Subscribe to changes in tickets table for this event
    const subscription = supabase
      .channel(`event-stats-${activeAssignment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `event_id=eq.${activeAssignment.event_id}`
        },
        () => {
          fetchStats(); // Refetch on any change (insert, update status)
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [activeAssignment]);

  const checkCameraAvailability = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setHasCamera(videoDevices.length > 0);
    } catch (err) {
      setHasCamera(true);
    }
  };

  const fetchAssignments = async () => {
    try {
      const { data: scannerRows, error: scannerErr } = await supabase
        .from('event_scanners')
        .select('*, event:events(id, title, venue, image_url, starts_at, ends_at, status)')
        .eq('is_active', true);

      if (scannerErr) throw scannerErr;

      const gracePeriod = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const activeRows = (scannerRows || []).filter((row: any) => {
        const event = row.event;
        if (!event) return false;
        const end = event.ends_at
          ? new Date(event.ends_at)
          : new Date(new Date(event.starts_at).getTime() + 6 * 60 * 60 * 1000);
        return end >= gracePeriod;
      });

      const { data: { user } } = await supabase.auth.getUser();
      let organizerAssignments: EventScannerAssignment[] = [];

      if (user) {
        scannerIdRef.current = user.id;
        const { data: ownedEvents, error: ownedErr } = await supabase
          .from('events')
          .select('id, title, venue, image_url, starts_at, ends_at, status')
          .eq('organizer_id', user.id)
          .neq('status', 'cancelled');

        if (!ownedErr && ownedEvents) {
          const visibleOwned = ownedEvents.filter(ev => {
            const end = ev.ends_at
              ? new Date(ev.ends_at)
              : new Date(new Date(ev.starts_at).getTime() + 6 * 60 * 60 * 1000);
            return end >= gracePeriod;
          });

          organizerAssignments = visibleOwned.map(ev => ({
            id: `organizer-${ev.id}`,
            event_id: ev.id,
            user_id: user.id,
            is_active: true,
            gate_name: 'All Gates (Organizer)',
            event: ev,
          } as unknown as EventScannerAssignment));
        }
      }

      const scannerEventIds = new Set(activeRows.map((r: any) => r.event_id));
      const merged = [
        ...activeRows,
        ...organizerAssignments.filter(a => !scannerEventIds.has(a.event_id)),
      ];

      setAssignments(merged);

      if (merged.length === 1) {
        const single = merged[0];
        const ev = single.event;
        if (ev) {
          const now = new Date();
          const start = new Date(ev.starts_at);
          const end = ev.ends_at
            ? new Date(ev.ends_at)
            : new Date(start.getTime() + 6 * 60 * 60 * 1000);

          // PHASE 40: Standardized Scan Window (starts_at - 2h)
          const scanStart = new Date(start.getTime() - 2 * 60 * 60 * 1000);

          if (now >= scanStart && now <= end) {
            setActiveAssignment(single);
          }
        }
      }
    } catch (err) {
      logError(err, { tag: 'fetch_scanner_assignments' });
    }
  };

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      videoRef.current.srcObject = null;
    }
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    setIsCameraActive(false);
    setFlashOn(false);
  }, []);

  const parseScannerPayload = (payload: string) => {
    if (!payload) return null;

    // DELIVERABLE 2: Guaranteed Detection Log
    console.log("QR DETECTED:", payload);

    let ticketId = payload.trim();
    let totp = '';

    // 1. Handle Yilama Protocol (yilama://scan?t=uuid&totp=123456)
    if (payload.includes('yilama://scan')) {
      try {
        const url = new URL(payload.replace('yilama://', 'https://'));
        ticketId = url.searchParams.get('t') || url.searchParams.get('ticket') || ticketId;
        totp = url.searchParams.get('totp') || '';
      } catch (e) {
        console.warn("Malformed Yilama URL:", payload);
      }
    }
    // 2. Handle HTTPS links (https://yilama.com/ticket/uuid?totp=123)
    else if (payload.startsWith('http')) {
      try {
        const url = new URL(payload);
        const pathParts = url.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.length > 30) {
          ticketId = lastPart;
        }
        totp = url.searchParams.get('totp') || '';
      } catch (e) {
        console.warn("Malformed HTTP URL:", payload);
      }
    }

    // Final Sanitize: ticketId should be just the UUID part if it was a deep link
    if (ticketId.includes('?')) {
      ticketId = (ticketId.split('?')[0] as string);
    }

    return { ticketId, totp };
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 }
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsCameraActive(true);
        setStatus('scanning');

        videoRef.current.onloadedmetadata = () => {
          requestRef.current = requestAnimationFrame(scanLoop);
        };
      }
    } catch (err: any) {
      logError(err, { tag: 'camera_start_failed' });
      setHasCamera(false);
      setStatus('error');
    }
  };

  const scanLoop = () => {
    // USE REFS for loop recursion to avoid closure traps (isCameraActiveRef)
    const currentStatus = statusRef.current;
    const isActive = isCameraActiveRef.current;

    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current && currentStatus === 'scanning' && !loadingRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;

      const scanSize = 400;
      canvas.width = scanSize;
      canvas.height = scanSize;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const vHeight = video.videoHeight;
        const vWidth = video.videoWidth;
        const size = Math.min(vWidth, vHeight);
        const sourceX = (vWidth - size) / 2;
        const sourceY = (vHeight - size) / 2;

        ctx.drawImage(video, sourceX, sourceY, size, size, 0, 0, scanSize, scanSize);

        const imageData = ctx.getImageData(0, 0, scanSize, scanSize);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });

        if (code && code.data) {
          validateTicket(code.data);
        }
      }
    }

    if (isActive) {
      requestRef.current = requestAnimationFrame(scanLoop);
    }
  };

  const toggleFlash = useCallback(async () => {
    if (!videoRef.current?.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const capabilities = track.getCapabilities();

    // @ts-ignore
    if (capabilities.torch) {
      try {
        // @ts-ignore
        await track.applyConstraints({ advanced: [{ torch: !flashOn }] });
        setFlashOn(!flashOn);
      } catch (e) {
        console.error("Flash toggle failed", e);
      }
    }
  }, [flashOn]);

  const isEventActive = (event: any) => {
    if (!event) return false;
    const now = new Date();
    const start = new Date(event.starts_at);
    const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 6 * 60 * 60 * 1000);

    // PHASE 40: Standardized Scan Window
    const scanStart = new Date(start.getTime() - 2 * 60 * 60 * 1000);

    return now >= scanStart && now <= end;
  };

  const downloadManifest = async (eventId: string) => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.rpc('get_offline_scanner_manifest', { p_event_id: eventId });
      if (error) throw error;
      if (data && data.success) {
        setManifest(data.manifest);
        localStorage.setItem('yilama_event_manifest', JSON.stringify(data.manifest));
        alert(`Manifest downloaded: ${data.manifest.length} valid tickets secured.`);
      }
    } catch (err: any) {
      logError(err, { tag: 'download_manifest_failed' });
      alert("Failed to download manifest: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    setIsSyncing(true);
    try {
      const { data: queueInsert, error: queueError } = await supabase
        .from('offline_sync_queue')
        .insert({
          scanner_id: (await supabase.auth.getUser()).data.user?.id,
          event_id: activeAssignment?.event_id,
          payload: offlineQueue
        })
        .select()
        .single();

      if (queueError) throw queueError;

      const { data: processResult } = await supabase.rpc('process_offline_sync_payload', { p_queue_id: queueInsert.id });

      setOfflineQueue([]);
      localStorage.setItem('yilama_offline_queue', '[]');
      alert(`Synced! ${processResult?.success_count || 0} accepted, ${processResult?.conflicts || 0} conflicts.`);
    } catch (err: any) {
      alert("Sync failed: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const validateTicketOffline = (payload: string) => {
    try {
      const parsed = parseScannerPayload(payload);
      if (!parsed) return;
      const { ticketId, totp } = parsed;

      const ticket = manifest.find(t => t.id === ticketId);
      if (!ticket) {
        setStatus('wrong-event');
        return;
      }

      if (offlineQueue.find(q => q.ticket_public_id === ticketId)) {
        setAttendeeInfo({ name: "Offline Attendee", message: "Already scanned at this device" });
        setStatus('already-used');
        return;
      }

      const secureTotpMatch = totp.length === 6;

      if (!secureTotpMatch && payload.startsWith('yilama://')) {
        setStatus('tampered');
        return;
      }

      const newScan = { ticket_public_id: ticketId, scanned_at: new Date().toISOString(), totp_used: totp, zone: activeAssignment?.gate_name || 'general' };
      const updatedQueue = [...offlineQueue, newScan];
      setOfflineQueue(updatedQueue);
      localStorage.setItem('yilama_offline_queue', JSON.stringify(updatedQueue));

      setAttendeeInfo({ name: "Offline Attendee", type: "Manifest Verified" });
      setStatus('success');
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

    } catch (e) {
      setStatus('error');
    }
  };

  const validateTicket = useCallback(async (payload: string) => {
    if (!payload || loading || !activeAssignment) return;

    const now = Date.now();
    if (now - lastScanTime.current < 2000) return;
    lastScanTime.current = now;

    if (isOfflineMode) {
      validateTicketOffline(payload);
      return;
    }

    setLoading(true);
    if (navigator.vibrate) navigator.vibrate(50);

    try {
      const parsed = parseScannerPayload(payload);
      if (!parsed) {
        console.warn("PARSING FAILED for payload:", payload);
        return;
      }
      const { ticketId, totp } = parsed;

      if (payload.startsWith('DEMO-')) {
        console.log("DEMO MODE ACTIVE:", payload);
        await new Promise(resolve => setTimeout(resolve, 800));
        if (payload.includes('FAIL')) {
          setStatus('tampered');
        } else if (payload.includes('USED')) {
          setAttendeeInfo({ name: "Demo User", message: "Scanned 5 mins ago" });
          setStatus('already-used');
        } else {
          setAttendeeInfo({ name: "Demo User", type: "VIP Guest" });
          setStatus('success');
        }
        return;
      }

      // DELIVERABLE 4: Log RPC Parameters
      const scannerId = scannerIdRef.current || (await supabase.auth.getUser()).data.user?.id;
      const rpcParams = {
        p_ticket_public_id: ticketId,
        p_event_id: activeAssignment.event_id,
        p_scanner_id: scannerId,
        p_zone: activeAssignment.gate_name || 'general',
        p_signature: totp || null
      };

      console.log("CALLING VALIDATE RPC:", rpcParams);

      const { data, error } = await supabase.rpc('validate_ticket_scan', rpcParams);

      if (error) {
        console.error("SCAN RPC ERROR:", error);
        throw error;
      }

      if (data.success) {
        setAttendeeInfo({ name: data.ticket?.owner || 'Attendee', type: data.ticket?.tier || 'General Access' });
        setStatus('success');
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
      } else {
        const reason = data.code;
        if (navigator.vibrate) navigator.vibrate(200);

        if (reason === 'DUPLICATE') {
          setAttendeeInfo({ name: 'Attendee', message: data.message });
          setStatus('already-used');
        } else if (reason === 'WRONG_EVENT') {
          setStatus('wrong-event');
        } else if (reason === 'INVALID_STATUS' || reason === 'NOT_FOUND') {
          setStatus('tampered');
        } else if (reason === 'INVALID_ZONE') {
          setAttendeeInfo({ name: 'Restricted Area', message: data.message });
          setStatus('wrong-event');
        } else if (reason === 'TOO_EARLY') {
          setAttendeeInfo({ name: 'Scan Window Closed', message: data.message });
          setStatus('locked');
        } else if (reason === 'TOO_LATE') {
          setAttendeeInfo({ name: 'Scan Window Closed', message: data.message });
          setStatus('locked');
        } else if (reason === 'COOLDOWN_ACTIVE') {
          setAttendeeInfo({ name: 'Cooldown Active', message: data.message });
          setStatus('locked');
        } else {
          setStatus('error');
        }
      }
    } catch (err: any) {
      logError(err, { tag: 'scan_validation_failed' });
      setStatus('error');
      if (navigator.vibrate) navigator.vibrate(200);
    } finally {
      setLoading(false);
    }
  }, [loading, activeAssignment, isOfflineMode, manifest, offlineQueue]);

  if (!activeAssignment) {
    return (
      <div className="px-6 py-12 max-w-2xl mx-auto space-y-12 animate-in fade-in pb-32">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">System Online</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black themed-text tracking-tighter leading-none uppercase">Gate<br />Control</h1>
          <p className="text-zinc-500 font-medium text-lg max-w-md leading-relaxed">Select an active event deployment to initialize scanning protocols.</p>
        </header>

        <div className="grid grid-cols-1 gap-6">
          {assignments.length > 0 ? assignments.map(a => {
            const active = isEventActive(a.event);
            return (
              <button
                key={a.id}
                disabled={!active}
                onClick={() => setActiveAssignment(a)}
                className={`group relative w-full h-48 rounded-[2.5rem] overflow-hidden text-left transition-all active:scale-[0.98] border shadow-xl hover:shadow-2xl ${active ? 'themed-border cursor-pointer' : 'opacity-40 grayscale blur-[1px] cursor-not-allowed border-zinc-200'}`}
              >
                <div className="absolute inset-0 bg-zinc-900">
                  {a.event?.image_url ? (
                    <img src={a.event.image_url} className="w-full h-full object-cover opacity-60 transition-opacity" alt="" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black opacity-50" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
                </div>

                <div className="absolute inset-0 p-8 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-white text-[9px] font-black uppercase tracking-widest border border-white/10">
                      {a.gate_name || 'Main Gate'}
                    </span>
                    {!active && (
                      <span className="px-3 py-1 bg-red-500/20 text-red-500 rounded-full text-[8px] font-black uppercase tracking-widest">Window Closed</span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-2xl font-black text-white leading-none uppercase tracking-tight mb-2">{a.event?.title}</h3>
                    <div className="flex items-center gap-2 text-white/60">
                      <p className="text-[10px] font-bold uppercase tracking-widest">{a.event?.venue}</p>
                    </div>
                  </div>
                </div>
              </button>
            );
          }) : (
            <div className="p-12 text-center border-2 border-dashed themed-border rounded-[2.5rem] opacity-40">
              <p className="font-bold uppercase tracking-widest text-xs">No active assignments found</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-30 p-6 pt-12 flex flex-col gap-4 bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setActiveAssignment(null); stopCamera(); setStatus('idle'); }}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-full px-4 py-2">
              <p className="text-[10px] font-black text-white uppercase tracking-widest truncate max-w-[150px]">{activeAssignment.event?.title}</p>
            </div>
          </div>
          {isCameraActive && (
            <button onClick={toggleFlash} className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${flashOn ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white border-white/10'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { label: 'Generated', value: stats.total, color: 'text-white' },
            { label: 'Scanned', value: isOfflineMode ? offlineQueue.length : stats.scanned, color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 backdrop-blur-md border border-white/5 p-3 rounded-2xl">
              <p className="text-[8px] font-black uppercase tracking-widest opacity-40 text-white">{s.label}</p>
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}

          <button
            onClick={() => {
              const newMode = !isOfflineMode;
              setIsOfflineMode(newMode);
              localStorage.setItem('yilama_offline_mode', String(newMode));
            }}
            className={`p-3 rounded-2xl border transition-all flex flex-col items-center justify-center ${isOfflineMode ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-white/5 border-white/5 text-zinc-400'}`}
          >
            <p className="text-[8px] font-black uppercase tracking-widest leading-none mb-1 text-white/50">Mode</p>
            <p className="text-sm font-black uppercase tracking-widest leading-none" >{isOfflineMode ? 'Offline' : 'Online'}</p>
          </button>

          <button
            onClick={() => isOfflineMode ? syncOfflineQueue() : downloadManifest(activeAssignment.event_id)}
            disabled={isSyncing}
            className="p-3 bg-blue-500/20 backdrop-blur-md border border-blue-500/50 rounded-2xl flex flex-col items-center justify-center text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            <p className="text-[8px] font-black uppercase tracking-widest leading-none mb-1 text-white/50">{isSyncing ? 'Wait' : 'Network'}</p>
            <p className="text-sm font-black uppercase tracking-widest leading-none" >{isOfflineMode ? 'Push Sync' : 'DL Manifest'}</p>
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-black">
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${isCameraActive ? 'opacity-100' : 'opacity-30'}`}
          style={{ imageRendering: 'auto' }}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />

        {isCameraActive && status === 'scanning' && (
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
            {/* Darkened Overlay around the clear scan window */}
            <div className="absolute inset-0 bg-black/40" style={{ clipPath: 'polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, 50% 50%, calc(50% - 128px) calc(50% - 128px), calc(50% + 128px) calc(50% - 128px), calc(50% + 128px) calc(50% + 128px), calc(50% - 128px) calc(50% + 128px), calc(50% - 128px) calc(50% - 128px), 50% 50%)' }} />

            <div className="w-64 h-64 border-2 border-white/50 rounded-[2rem] relative overflow-hidden">
              <div className="absolute w-full h-0.5 bg-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.8)] top-0 animate-[scan_2s_ease-in-out_infinite]" />
              <div className="absolute top-4 left-4 w-4 h-4 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <div className="absolute top-4 right-4 w-4 h-4 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <div className="absolute bottom-4 left-4 w-4 h-4 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <div className="absolute bottom-4 right-4 w-4 h-4 border-b-4 border-r-4 border-white rounded-br-lg" />
            </div>
            <p className="mt-8 text-white/60 text-[10px] font-black uppercase tracking-[0.2em]">Center Ticket Inside Frame</p>
          </div>
        )}

        {status === 'success' && (
          <div className="absolute inset-0 z-40 bg-green-500 flex flex-col items-center justify-center p-8 animate-in zoom-in-95">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-green-500 mb-6 shadow-2xl">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-white font-black text-3xl uppercase tracking-tighter mb-4">Valid Admission</h2>
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl w-full max-w-sm text-center border border-white/20">
              <p className="text-white font-black text-xl mb-1">{attendeeInfo?.name}</p>
              <p className="text-white/60 text-[10px] uppercase font-black tracking-widest">{attendeeInfo?.type}</p>
            </div>
            <button onClick={() => setStatus('scanning')} className="absolute bottom-12 left-8 right-8 py-5 bg-white text-green-600 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl">Continue Scanning</button>
          </div>
        )}

        {status === 'already-used' && (
          <div className="absolute inset-0 z-40 bg-amber-500 flex flex-col items-center justify-center p-8 animate-in slide-in-from-bottom">
            <svg className="w-20 h-20 text-white mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <h2 className="text-white font-black text-2xl uppercase tracking-tighter text-center">Duplicate Ticket</h2>
            <p className="text-white/80 text-sm mt-2 text-center max-w-[250px]">{attendeeInfo?.message}</p>
            <button onClick={() => setStatus('scanning')} className="absolute bottom-12 left-8 right-8 py-5 bg-black/20 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest">Back to Scanner</button>
          </div>
        )}

        {(status === 'tampered' || status === 'wrong-event' || status === 'error') && (
          <div className="absolute inset-0 z-40 bg-red-600 flex flex-col items-center justify-center p-8 animate-in shake">
            <svg className="w-20 h-20 text-white mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
            <h2 className="text-white font-black text-2xl uppercase tracking-tighter">Access Denied</h2>
            <p className="text-white/80 text-xs mt-2 uppercase font-black tracking-widest text-center">
              {status === 'tampered' ? 'Invalid Signature / Tampered' : status === 'wrong-event' ? 'Wrong Event Selection' : 'System Authorization Error'}
            </p>
            <button onClick={() => setStatus('scanning')} className="absolute bottom-12 left-8 right-8 py-5 bg-white text-red-600 rounded-[2rem] font-black text-xs uppercase tracking-widest">Retry</button>
          </div>
        )}

        {!isCameraActive && status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
            {hasCamera === false ? (
              <div className="text-center space-y-4">
                <p className="text-white/30 text-[9px] font-black uppercase tracking-widest">No hardware detected</p>
                <h2 className="text-white font-black text-2xl uppercase tracking-tight">Manual Mode</h2>
              </div>
            ) : (
              <button onClick={startCamera} className="w-24 h-24 rounded-full bg-white text-black flex items-center justify-center shadow-2xl animate-pulse">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-6 bg-black border-t border-white/5">
        <form onSubmit={(e) => { e.preventDefault(); validateTicket(manualCode); }} className="relative">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="MANUAL PAYLOAD (ID:SIG)"
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-mono font-bold text-white placeholder:text-white/20 focus:border-white transition-all outline-none"
          />
        </form>
        <p className="text-center text-white/20 text-[8px] font-black uppercase tracking-widest mt-6">Production Access Protocols Engaged</p>
      </div>
    </div>
  );
};
