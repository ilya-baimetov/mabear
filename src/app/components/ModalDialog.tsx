import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";

function isOutsideDialog(e: ReactPointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  lightDismiss?: boolean;
  className?: string;
  surfaceClassName?: string;
  ariaLabelledBy: string;
  dataTestId?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function ModalDialog({
  open,
  onClose,
  lightDismiss = true,
  className,
  surfaceClassName,
  ariaLabelledBy,
  dataTestId,
  initialFocusRef,
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const outsideDownRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const notifiedCloseRef = useRef(false);

  const dismiss = () => {
    if (!openRef.current || notifiedCloseRef.current) return;
    notifiedCloseRef.current = true;
    onClose();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      notifiedCloseRef.current = false;
      outsideDownRef.current = false;
      if (!dialog.open) {
        dialog.showModal();
        initialFocusRef?.current?.focus({ preventScroll: true });
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      className={className}
      data-testid={dataTestId}
      aria-labelledby={ariaLabelledBy}
      {...({ closedby: lightDismiss ? "any" : "closerequest" } as Record<string, unknown>)}
      onCancel={dismiss}
      onClose={dismiss}
      onPointerDown={(e) => {
        if (!lightDismiss) {
          outsideDownRef.current = false;
          return;
        }
        if (e.pointerType === "mouse" && e.button !== 0) return;
        outsideDownRef.current = isOutsideDialog(e, e.currentTarget);
      }}
      onPointerUp={(e) => {
        const wasOutside = outsideDownRef.current;
        outsideDownRef.current = false;
        if (!lightDismiss) return;
        if (wasOutside && isOutsideDialog(e, e.currentTarget)) dismiss();
      }}
    >
      <div className={surfaceClassName ? `dialog-surface ${surfaceClassName}` : "dialog-surface"}>
        {children}
      </div>
    </dialog>
  );
}
