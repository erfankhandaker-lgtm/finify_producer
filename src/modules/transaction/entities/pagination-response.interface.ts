export interface PaginationResponse<T> {
  data: T[];
  totalRecords: number;
  currentPage: number;
  totalPages: number;
}