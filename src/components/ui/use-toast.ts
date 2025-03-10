import { toast } from "sonner"

export { toast }
export const useToast = () => {
  return {
    toast,
    dismiss: toast.dismiss,
    error: (message: string) => toast.error(message),
    success: (message: string) => toast.success(message),
  }
} 