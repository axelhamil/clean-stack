import { useEffect, useState } from "react";

export interface PasskeySupport {
  available: boolean;
  conditional: boolean;
}

export function usePasskeySupported(): PasskeySupport {
  const [support, setSupport] = useState<PasskeySupport>({
    available: false,
    conditional: false,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return;

    const available = true;
    const checkConditional =
      window.PublicKeyCredential.isConditionalMediationAvailable;

    if (typeof checkConditional !== "function") {
      setSupport({ available, conditional: false });
      return;
    }

    checkConditional
      .call(window.PublicKeyCredential)
      .then((conditional) => setSupport({ available, conditional }))
      .catch(() => setSupport({ available, conditional: false }));
  }, []);

  return support;
}
