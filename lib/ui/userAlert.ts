import { showAppAlert, showAppConfirm } from '@/lib/ui/AppDialogProvider';

export function userAlert(title: string, message?: string): void {
  showAppAlert(title, message);
}

type UserConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
};

export function userConfirm(title: string, message: string, options?: UserConfirmOptions): Promise<boolean> {
  return showAppConfirm(title, message, options);
}
