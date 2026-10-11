import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

/** Modal yes/no question on top of the native <dialog> (focus trap + Esc for free). */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="confirm" aria-labelledby="confirm-title" onClose={onClose}>
      <h2 id="confirm-title">{title}</h2>
      <p>{body}</p>
      <form method="dialog" className="confirm-actions">
        <button className="btn" value="cancel" autoFocus>
          {cancelLabel}
        </button>
        <button className="btn danger" value="ok" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </form>
    </dialog>
  );
}
