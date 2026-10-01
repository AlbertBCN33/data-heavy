// Secondary entry point: lets the app shell import toasts without the whole ui barrel, which would
// otherwise pull every primitive (and the CDK) into the initial bundle via code splitting.
export * from './lib/toast/toast-outlet';
export * from './lib/toast/toast.service';
