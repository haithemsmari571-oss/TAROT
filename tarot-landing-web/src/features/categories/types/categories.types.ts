export interface Category {
  id: number;
  title: string;
}

export interface CategoryCreate {
  title: string;
}

export interface CategoryUpdate {
  title?: string;
}
