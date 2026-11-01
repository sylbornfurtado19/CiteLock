"use client";

import React from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react";

/**
 * Sanitizes raw error payloads to ensure stack traces, DB queries,
 * file paths, or server internals are never exposed to the user.
 */
export function sanitizeErrorMessage(
  err: unknown,
  defaultMessage = "An unexpected error occurred. Please try again."
): string {
  if (!err) return defaultMessage;

  let rawMessage = "";
  if (typeof err === "string") {
    rawMessage = err;
  } else if (err instanceof Error) {
    rawMessage = err.message;
  } else if (typeof err === "object" && err !== null && "message" in err) {
    rawMessage = String((err as { message: unknown }).message);
  } else {
    return defaultMessage;
  }

  // Strip stack traces or multi-line python tracebacks
  if (
    rawMessage.includes("Traceback (most recent call last)") ||
    rawMessage.includes("File \"") ||
    rawMessage.includes("at Object.") ||
    rawMessage.includes("at async")
  ) {
    return defaultMessage;
  }

  // Strip database connection strings, passwords, or raw SQL queries
  if (
    /password|psycopg|sqlalchemy|select\s+.*from|pgvector|insert\s+into|neon/i.test(
      rawMessage
    )
  ) {
    return "A database operation failed. Please try again later.";
  }

  // Strip Internal Server Error 500 dumps
  if (
    rawMessage.startsWith("API Error 500") ||
    rawMessage.includes("Internal Server Error")
  ) {
    return "The verification service encountered an internal issue. Please try again.";
  }

  // Clean Firebase auth error codes into helpful user guidance
  if (
    rawMessage.includes("auth/invalid-credential") ||
    rawMessage.includes("auth/invalid-login-credentials")
  ) {
    return "Invalid email or password. Please verify your credentials.";
  }
  if (rawMessage.includes("auth/user-not-found")) {
    return "No account found with this email address.";
  }
  if (rawMessage.includes("auth/wrong-password")) {
    return "Incorrect password. Please try again.";
  }
  if (rawMessage.includes("auth/email-already-in-use")) {
    return "This email is already registered. Please sign in.";
  }
  if (rawMessage.includes("auth/popup-closed-by-user")) {
    return "Authentication was cancelled by the user.";
  }
  if (rawMessage.includes("auth/network-request-failed")) {
    return "Network error. Please check your internet connection.";
  }
  if (rawMessage.includes("auth/too-many-requests")) {
    return "Too many attempts. Please wait a few moments before trying again.";
  }

  // If prefixed with API Error 400/403/404/422, extract clean detail
  const apiErrorMatch = rawMessage.match(/^API Error \d+:\s*(.*)$/);
  if (apiErrorMatch && apiErrorMatch[1]) {
    const detail = apiErrorMatch[1].trim();
    // If detail looks like JSON, attempt to extract human message
    if (detail.startsWith("{") || detail.startsWith("[")) {
      try {
        const parsed = JSON.parse(detail);
        if (typeof parsed === "string") return parsed;
        if (parsed.detail && typeof parsed.detail === "string") return parsed.detail;
        if (Array.isArray(parsed) && parsed[0]?.msg) return parsed[0].msg;
      } catch {
        return defaultMessage;
      }
    }
    return detail.length > 200 ? `${detail.slice(0, 197)}...` : detail;
  }

  // Bound message length to prevent oversized UI toasts
  if (rawMessage.length > 250) {
    return `${rawMessage.slice(0, 247)}...`;
  }

  return rawMessage;
}

export interface NotifyAction {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export interface NotifyOptions {
  description?: React.ReactNode;
  id?: string | number;
  duration?: number;
  action?: NotifyAction;
  cancel?: NotifyAction;
  onDismiss?: () => void;
  onAutoClose?: () => void;
}

/**
 * Centralized CiteLock notification helper providing consistent toast feedback
 * across all mutations and asynchronous workflows.
 */
export const notify = {
  success: (title: string, options?: NotifyOptions) => {
    return sonnerToast.success(title, {
      id: options?.id,
      description: options?.description,
      duration: options?.duration ?? 4000,
      action: options?.action,
      cancel: options?.cancel,
      onDismiss: options?.onDismiss,
      onAutoClose: options?.onAutoClose,
    });
  },

  error: (
    title: string,
    errorOrOptions?: unknown | NotifyOptions,
    maybeOptions?: NotifyOptions
  ) => {
    let description: React.ReactNode = undefined;
    let finalOptions: NotifyOptions | undefined = undefined;

    // Check if second argument is options or raw error
    if (
      errorOrOptions &&
      typeof errorOrOptions === "object" &&
      !("message" in errorOrOptions) &&
      !("stack" in errorOrOptions) &&
      ("description" in errorOrOptions ||
        "action" in errorOrOptions ||
        "id" in errorOrOptions ||
        "duration" in errorOrOptions)
    ) {
      finalOptions = errorOrOptions as NotifyOptions;
      description = finalOptions.description;
    } else if (errorOrOptions !== undefined) {
      description = sanitizeErrorMessage(errorOrOptions);
      finalOptions = maybeOptions;
    } else {
      finalOptions = maybeOptions;
    }

    return sonnerToast.error(title, {
      id: finalOptions?.id,
      description: finalOptions?.description ?? description,
      duration: finalOptions?.duration ?? 6000,
      action: finalOptions?.action,
      cancel: finalOptions?.cancel,
      onDismiss: finalOptions?.onDismiss,
      onAutoClose: finalOptions?.onAutoClose,
    });
  },

  warning: (title: string, options?: NotifyOptions) => {
    return sonnerToast.warning(title, {
      id: options?.id,
      description: options?.description,
      duration: options?.duration ?? 5000,
      action: options?.action,
      cancel: options?.cancel,
      onDismiss: options?.onDismiss,
      onAutoClose: options?.onAutoClose,
    });
  },

  info: (title: string, options?: NotifyOptions) => {
    return sonnerToast.info(title, {
      id: options?.id,
      description: options?.description,
      duration: options?.duration ?? 4000,
      action: options?.action,
      cancel: options?.cancel,
      onDismiss: options?.onDismiss,
      onAutoClose: options?.onAutoClose,
    });
  },

  loading: (
    title: string,
    options?: { description?: React.ReactNode; id?: string | number }
  ) => {
    return sonnerToast.loading(title, {
      id: options?.id,
      description: options?.description,
    });
  },

  promise: sonnerToast.promise,

  dismiss: (id?: string | number) => {
    return sonnerToast.dismiss(id);
  },
};

/**
 * CiteLock Toaster component providing unified dark glass aesthetics,
 * accessible contrast, and smooth transitions for all application toasts.
 */
export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      expand={false}
      richColors={false}
      closeButton
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />,
        error: <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />,
        warning: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />,
        info: <Info className="h-4 w-4 text-purple-400 shrink-0" />,
        loading: <Loader2 className="h-4 w-4 text-purple-300 animate-spin shrink-0" />,
      }}
      toastOptions={{
        className:
          "group flex items-start gap-3 w-full p-4 rounded-xl border border-purple-500/25 bg-[#0E071D]/95 backdrop-blur-xl text-[#F5F0FF] shadow-[0_12px_40px_rgba(0,0,0,0.7)] font-sans transition-all",
        classNames: {
          toast:
            "!bg-[#0E071D]/95 !border-purple-500/25 !text-[#F5F0FF] !backdrop-blur-xl !shadow-[0_12px_40px_rgba(0,0,0,0.7)] !rounded-xl !p-3.5",
          title: "!text-xs !font-semibold !tracking-wide !text-[#F5F0FF]",
          description: "!text-[11px] !text-[#B0A4C3] !mt-0.5 !leading-relaxed",
          actionButton:
            "!text-xs !px-3 !py-1 !rounded-lg !bg-purple-600 hover:!bg-purple-500 !text-white !font-medium !transition-colors !shadow-sm",
          cancelButton:
            "!text-xs !px-3 !py-1 !rounded-lg !bg-purple-950/80 hover:!bg-purple-900 !border !border-purple-500/30 !text-purple-200 !transition-colors",
          closeButton:
            "!bg-[#180E2E] !border-purple-500/30 !text-[#B0A4C3] hover:!text-white hover:!bg-[#221340]",
          success: "!border-emerald-500/35 !bg-[#071913]/95",
          error: "!border-rose-500/35 !bg-[#1A0A10]/95",
          warning: "!border-amber-500/35 !bg-[#1F1404]/95",
          info: "!border-purple-500/35 !bg-[#0E071D]/95",
        },
      }}
    />
  );
}

export { sonnerToast as toast };

