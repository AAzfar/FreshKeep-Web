'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import type { SyncItem } from '@/lib/db';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataReceived: (items: SyncItem[]) => Promise<void>;
}

export function SyncModal({ isOpen, onClose, onDataReceived }: SyncModalProps) {
  const [peerId, setPeerId] = useState<string>('');
  const [status, setStatus] = useState<'waiting' | 'connecting' | 'connected' | 'synced' | 'error'>('waiting');
  const [connectionError, setConnectionError] = useState('');
  const [iceState, setIceState] = useState<RTCIceConnectionState | 'not started'>('not started');

  // Keep the latest callback in a ref so useEffect doesn't restart when IndexedDB updates
  const onDataReceivedRef = useRef(onDataReceived);
  useEffect(() => {
    onDataReceivedRef.current = onDataReceived;
  }, [onDataReceived]);

  useEffect(() => {
    if (!isOpen) return;

    let peerInstance: import('peerjs').Peer | null = null;
    setStatus('waiting');
    setConnectionError('');
    setIceState('not started');

    import('peerjs').then(({ Peer }) => {
      const generatedId = `companion-${crypto.randomUUID().slice(0, 8)}`;
      const peer = new Peer(generatedId, { debug: 3 });
      peerInstance = peer;

      peer.on('open', (id) => {
        setPeerId(id);
        setStatus('waiting');
      });

      peer.on('connection', (conn) => {
        setStatus('connecting');

        conn.on('iceStateChanged', (state) => {
          setIceState(state);
          if (state === 'failed') {
            setConnectionError('ICE negotiation failed. The Android and web peers need reachable STUN/TURN servers.');
            setStatus('error');
          }
        });

        conn.on('open', () => {
          setStatus('connected');
        });

        conn.on('data', async (rawData) => {
          try {
            const parsed: SyncItem[] =
              typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            await onDataReceivedRef.current(parsed);
            setStatus('synced');

            // Acknowledge receipt back to Android
            conn.send(JSON.stringify({ status: 'ACK', count: parsed.length }));

            // Auto-close modal after 1.5 seconds so the user sees their synced list
            setTimeout(() => {
              onClose();
            }, 1500);
          } catch (err) {
            console.error('Invalid sync payload:', err);
            setConnectionError(err instanceof Error ? err.message : 'Could not save received data.');
            setStatus('error');
          }
        });

        conn.on('error', (err) => {
          console.error('Peer data connection error:', err);
          setConnectionError(err.message);
          setStatus('error');
        });

        conn.on('close', () => {
          setStatus((current) => current === 'synced' ? current : 'error');
          setConnectionError((current) => current || 'The device connection closed before data was received.');
        });
      });

      peer.on('error', (err) => {
        console.error('Peer connection error:', err);
        setConnectionError(err.message);
        setStatus('error');
      });
    }).catch((err: unknown) => {
      console.error('Could not start PeerJS:', err);
      setConnectionError(err instanceof Error ? err.message : 'Could not start the sync connection.');
      setStatus('error');
    });

    return () => {
      peerInstance?.destroy();
      setPeerId('');
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Pair with Android App</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center py-4">
          {status === 'synced' ? (
            <div className="flex flex-col items-center gap-2 py-6 text-green-600">
              <CheckCircle2 className="h-12 w-12" />
              <p className="font-semibold">Data Synced Successfully!</p>
            </div>
          ) : peerId ? (
            <>
              <div className="rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-sm">
                <QRCodeSVG value={peerId} size={200} />
              </div>
              <p className="mt-4 text-center text-sm text-slate-600">
                Open your Android app and scan this QR code to transfer your items locally.
              </p>
              <p className="mt-2 font-mono text-xs text-slate-400">ID: {peerId}</p>
              {status !== 'waiting' && (
                <p className={`mt-3 text-center text-sm ${status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>
                  {status === 'connecting' && 'Device found. Establishing the data connection...'}
                  {status === 'connected' && 'Connected. Waiting for Android data...'}
                  {status === 'error' && (connectionError || 'The sync connection failed.')}
                  {status !== 'error' && ` ICE: ${iceState}.`}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Generating pairing code...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
