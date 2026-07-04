import React, { useCallback, useEffect, useState } from 'react';

import { CustomConfirmModal } from '@/components/common/CustomConfirmModal';

export type CustomConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
};

type ConfirmController = {
  show: (request: CustomConfirmRequest) => void;
};

let controller: ConfirmController | null = null;

function setConfirmController(next: ConfirmController | null) {
  controller = next;
}

/** Imperative entry point — works on web and native without window.confirm or Alert.alert. */
export function showCustomConfirm(request: CustomConfirmRequest): void {
  if (controller) {
    controller.show(request);
    return;
  }

  // Fallback if provider is not mounted (e.g. unit tests).
  void request.onConfirm();
}

export function CustomConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<CustomConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    setBusy(false);
    setRequest(null);
  }, []);

  const show = useCallback((next: CustomConfirmRequest) => {
    setBusy(false);
    setRequest(next);
  }, []);

  useEffect(() => {
    setConfirmController({ show });
    return () => {
      setConfirmController(null);
    };
  }, [show]);

  const onCancel = useCallback(() => {
    if (busy) return;
    request?.onCancel?.();
    close();
  }, [busy, close, request]);

  const onConfirm = useCallback(async () => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await request.onConfirm();
      close();
    } catch {
      setBusy(false);
    }
  }, [busy, close, request]);

  return (
    <>
      {children}
      <CustomConfirmModal
        visible={!!request}
        title={request?.title ?? ''}
        message={request?.message ?? ''}
        confirmLabel={request?.confirmLabel ?? ''}
        cancelLabel={request?.cancelLabel ?? ''}
        destructive={request?.destructive ?? false}
        busy={busy}
        onConfirm={() => {
          void onConfirm();
        }}
        onCancel={onCancel}
      />
    </>
  );
}
