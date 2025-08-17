import { format } from 'date-fns';

export const formatDate = (date: Date | undefined): string => {
  if (!date) {
    return '';
  }
  return format(date, 'PPpp');
};