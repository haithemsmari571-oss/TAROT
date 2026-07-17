/** Backend error detail from an axios failure, without reaching for `any`. */
export const apiErrorDetail = (error: unknown): string | undefined =>
  (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
