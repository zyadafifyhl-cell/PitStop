import { showCustomConfirm } from '@/lib/ui/CustomConfirmProvider';

type NoShowOverridePrompt = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
};

export function promptMerchantNoShowOverride(input: NoShowOverridePrompt): void {
  showCustomConfirm({
    title: input.title,
    message: input.message,
    confirmLabel: input.confirmLabel,
    cancelLabel: input.cancelLabel,
    destructive: true,
    onConfirm: input.onConfirm,
  });
}
