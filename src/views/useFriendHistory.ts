import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { cancelDownload, downloadHistory, friendLibrary, historyState, markViewed, removeHistory, useDownloads, type HistoryState } from '../lib/friends';
import type { Library } from '../lib/library';

/**
 * Someone's downloaded history, for the pages that show it (their stats, their artist / album / song
 * pages, comparing with them). With `auto`, the download starts by itself the first time (once per
 * visit). A download started on another page is picked up when it finishes.
 */
export function useFriendHistory(name: string, auto: boolean) {
  const apiKey = useApp((s) => s.apiKey);
  const fixes = useApp((s) => s.albumPrefs.fixes);
  const running = useDownloads((s) => s.running[name.toLowerCase()]);
  const [hist, setHist] = useState<HistoryState | null | undefined>(undefined);
  const [lib, setLib] = useState<Library | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stopped, setStopped] = useState(!auto);
  const started = useRef(false);

  // looking at someone keeps their data another day
  useEffect(() => {
    void markViewed(name);
  }, [name]);

  // what's stored, re-read whenever a download (this one, or one started elsewhere) finishes
  useEffect(() => {
    if (running) return;
    let live = true;
    void historyState(name).then((h) => live && setHist(h ?? null));
    return () => {
      live = false;
    };
  }, [running, name]);

  useEffect(() => {
    if (hist !== null || running || stopped || started.current) return;
    started.current = true;
    downloadHistory(name, apiKey).catch((e) => setErr((e as Error).message));
  }, [hist, running, stopped, name, apiKey]);

  useEffect(() => {
    if (!hist) return;
    let live = true;
    void friendLibrary(name, fixes).then((l) => live && setLib(l));
    return () => {
      live = false;
    };
  }, [hist, name, fixes]);

  return {
    hist,
    // (only while there's a stored history: removing it hides the old one straight away)
    lib: hist ? lib : null,
    running,
    err,
    stopped,
    stop: () => {
      setStopped(true);
      cancelDownload(name);
    },
    /** start (or resume) the download */
    load: () => {
      started.current = false;
      setErr(null);
      setStopped(false);
    },
    update: () => {
      setErr(null);
      downloadHistory(name, apiKey).catch((e) => setErr((e as Error).message));
    },
    remove: async () => {
      await removeHistory(name);
      setStopped(true);
      setHist(null);
    },
  };
}
