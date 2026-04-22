import { useState, useCallback, useRef } from 'react';

export function useToast() {
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    
    setToast({ message, type });
    timerRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  return { toast, showToast, hideToast: () => setToast(null) };
}
