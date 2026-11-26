import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileText,
  Shield,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import { AdSdkLogEntry, UnityAdConfigState } from '../services/androidBridge';

const androidProjectFiles = import.meta.glob('/android-project/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface AndroidStudioModalProps {
  adConfig: UnityAdConfigState;
  adLogs: AdSdkLogEntry[];
  onToggleTestMode: () => void;
  onClose: () => void;
}

export const AndroidStudioModal: React.FC<AndroidStudioModalProps> = ({
  adConfig,
  adLogs,
  onToggleTestMode,
  onClose,
}) => {
  const fileList = useMemo(() => {
    return Object.keys(androidProjectFiles)
      .map((fullPath) => ({
        fullPath,
        relPath: fullPath.replace(/^\/android-project\//, ''),
        content: androidProjectFiles[fullPath],
      }))
      .sort((a, b) => {
        if (a.relPath === 'APK_BUILD_INSTRUCTIONS.md') return -1;
        if (b.relPath === 'APK_BUILD_INSTRUCTIONS.md') return 1;
        return a.relPath.localeCompare(b.relPath);
      });
  }, []);

  const [selectedPath, setSelectedPath] = useState<string>(
    fileList[0]?.relPath ?? 'APK_BUILD_INSTRUCTIONS.md'
  );
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectedFile = fileList.find((f) => f.relPath === selectedPath) ?? fileList[0];

  const handleCopy = async () => {
    if (!selectedFile) return;
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked in sandbox
    }
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      const rootFolder = zip.folder('ApexHorizonStunt3D-AndroidStudio');
      if (rootFolder) {
        for (const f of fileList) {
          rootFolder.file(f.relPath, f.content);
        }
        // Include README placeholder inside app/src/main/assets/www reminding user to run npm run build:android-assets
        rootFolder.file(
          'app/src/main/assets/www/README_SYNC.txt',
          'Run `npm run build:android-assets` from the web repo root to copy the compiled dist/ 3D game bundle into this directory before building the APK.\n'
        );
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ApexHorizonStunt3D-AndroidStudio.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-3 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0F141F] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Android Studio Project &amp; Unity Ads SDK 4.22.0
            </h2>
            <p className="text-xs text-slate-400">
              Complete Kotlin Gradle project, Manifest, ProGuard rules, Unity Ads callbacks, and signed APK guide
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleDownloadZip}
              disabled={downloading}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4" />
              <span>{downloading ? 'Packaging ZIP...' : 'Download Android Project (.zip)'}</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close Android Studio Inspector"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Policy & Mode Bar */}
        <div className="grid grid-cols-1 gap-3 border-b border-white/10 bg-[#141A28] px-5 py-3 md:grid-cols-3">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0B0E14] px-3.5 py-2.5">
            <div>
              <div className="text-[11px] text-slate-400">Unity Ads Mode</div>
              <div className="text-xs font-semibold text-white">
                {adConfig.testMode ? 'Test Mode (Debug Variant)' : 'Production Mode (Release Variant)'}
              </div>
            </div>
            <button
              onClick={onToggleTestMode}
              className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
            >
              {adConfig.testMode ? (
                <ToggleRight className="h-6 w-6 text-amber-400" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-emerald-400" />
              )}
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0B0E14] px-3.5 py-2.5">
            <div className="text-[11px] text-slate-400">Placeholder Credentials</div>
            <div className="font-mono-tabular truncate text-xs text-amber-400">
              {adConfig.gameIdPlaceholder}
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0B0E14] px-3.5 py-2.5">
            <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="text-xs text-slate-300">
              Unity Ads + Amazon Appstore Compliant · No ads during driving
            </div>
          </div>
        </div>

        {/* File Tree + Code Viewer + Live Callback Log */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
          {/* Left File Sidebar */}
          <div className="overflow-y-auto border-b border-white/10 bg-[#0B0E14] p-3 lg:col-span-4 lg:border-b-0 lg:border-r">
            <div className="mb-2 px-2 text-[11px] font-semibold text-slate-400">
              android-project/ ({fileList.length} files)
            </div>
            <div className="space-y-1">
              {fileList.map((f) => {
                const active = f.relPath === selectedPath;
                return (
                  <button
                    key={f.relPath}
                    onClick={() => setSelectedPath(f.relPath)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/15 font-semibold text-amber-300'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {f.relPath.endsWith('.md') ? (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    ) : (
                      <Code2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate font-mono-tabular">{f.relPath}</span>
                  </button>
                );
              })}
            </div>

            {/* Callback Event Log */}
            <div className="mt-5 border-t border-white/10 pt-3">
              <div className="mb-2 px-2 text-[11px] font-semibold text-slate-400">
                Unity Ads SDK Event Trace
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto px-2">
                {adLogs.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="text-[11px] leading-snug">
                    <span className="font-mono-tabular text-slate-500">{entry.time} </span>
                    <span className="font-semibold text-cyan-400">{entry.event}: </span>
                    <span className="text-slate-300">{entry.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Code Preview */}
          <div className="flex min-h-[340px] flex-col overflow-hidden lg:col-span-8">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#141A28] px-4 py-2.5">
              <span className="font-mono-tabular text-xs font-medium text-slate-200 truncate">
                android-project/{selectedFile?.relPath}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md border border-white/10 bg-[#0B0E14] px-2.5 py-1 text-xs text-slate-200 hover:bg-white/5 cursor-pointer shrink-0"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy File</span>
                  </>
                )}
              </button>
            </div>
            <pre className="flex-1 overflow-auto bg-[#0A0D14] p-4 font-mono-tabular text-xs leading-relaxed text-slate-200">
              <code>{selectedFile?.content ?? ''}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
