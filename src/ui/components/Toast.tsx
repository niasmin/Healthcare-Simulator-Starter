import { useEffect } from 'react';
import { useT } from '../hooks';
import { useGame } from '../store';

export function Toast() {
  const t = useT();
  const toast = useGame((s) => s.toast);
  const dismiss = useGame((s) => s.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(dismiss, 2600);
    return () => clearTimeout(h);
  }, [toast, dismiss]);
  if (!toast) return null;
  return (
    <div role="alert" className="fixed left-1/2 top-16 -translate-x-1/2 z-50 rounded-lg bg-bad text-white text-sm px-4 py-2 shadow-lg">
      {t(toast.key, toast.params)}
    </div>
  );
}
