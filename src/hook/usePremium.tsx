'use client';

import { useState, useEffect } from 'react';

export function usePremium() {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('fk_premium_status');
    if (saved === 'true') {
      setIsPremium(true);
    }
  }, []);

  const unlockPremium = () => {
    localStorage.setItem('fk_premium_status', 'true');
    setIsPremium(true);
  };

  return { isPremium, unlockPremium };
}
